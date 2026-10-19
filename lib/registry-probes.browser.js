(function () {
  'use strict';

  var THRESHOLD_KEYS = ['minTextPx', 'minTapHitPx'];
  var CONTROL_SELECTOR = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="link"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="option"],[tabindex]:not([tabindex="-1"])';
  var LABEL_SELECTOR = 'button,[role="button"],[role="tab"],a[class*="btn"],a[class*="button"],a[class*="tab"]';
  var POPUP_PATTERN = /modal|popup|popnoti|dialog|lightbox|newsletter|toast|snackbar|cookie|consent/i;
  var CLOSE_PATTERN = /clos|dismiss|đóng|dong|huỷ|hủy|no thanks/i;
  var CLOSE_GLYPH = /^\s*[x×✕✖✗]\s*$/i;
  var CLIP_ZERO = /^rect\(\s*0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?[\s,]+0(?:px)?\s*\)$/;
  var CLIP_PATH_COLLAPSED = /^inset\(\s*(?:50|100)%/;
  var PREVIEW_CHROME_SELECTOR = '#haravan-notification,#preview-bar-iframe,#admin_bar_iframe,iframe[src*="preview_bar"],.haravan-preview-bar';
  var SKIP_TEXT_PARENTS = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE|HEAD|OPTION)$/;
  var PAINTED_TAGS = /^(IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|TEXTAREA|SELECT|BUTTON|PICTURE|EMBED|OBJECT)$/;
  var PAGE_PROBES = ['min-font-size', 'control-height-band', 'wrapped-label', 'tap-target-hit-area', 'icon-stroke', 'invisible-click-blocker', 'timed-popup-occluder', 'sticky-released-occluder', 'text-overlap'];
  var SCOPED_PROBES = ['min-font-size', 'control-height-band', 'wrapped-label', 'tap-target-hit-area', 'icon-stroke', 'text-overlap'];
  var SLUG_OF_PROBE = {
    'min-font-size': 'min-font-size',
    'control-height-band': 'control-height-band',
    'wrapped-label': 'wrapped-label',
    'tap-target-hit-area': 'tap-target-hit-area',
    'icon-stroke': 'icon-stroke-mismatch',
    'invisible-click-blocker': 'invisible-click-blocker',
    'timed-popup-occluder': 'timed-popup-occluder',
    'sticky-released-occluder': 'sticky-released-occluder',
    'text-overlap': 'text-overlap',
    'overlay-fit': 'overlay-viewport-cap'
  };

  var state = { baseline: null };

  function num(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : null;
  }

  function px(value) {
    return Math.round(value * 100) / 100 + 'px';
  }

  function css(el, pseudo) {
    return window.getComputedStyle(el, pseudo || null);
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }

  function classText(el) {
    return typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || '';
  }

  function selectorOf(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 4) {
      var part = node.tagName.toLowerCase();
      if (node.id) {
        part += '#' + node.id;
        parts.unshift(part);
        break;
      }
      var classes = classText(node).split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) part += '.' + classes.join('.');
      var siblings = node.parentElement ? Array.prototype.filter.call(node.parentElement.children, function (c) { return c.tagName === node.tagName; }) : [];
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function isVisible(el) {
    if (!el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    var cs = css(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && num(cs.opacity) !== 0;
  }

  function isTiny(r) {
    return r.width <= 2 && r.height <= 2;
  }

  function inViewport(r) {
    return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  }

  function isAriaHidden(el) {
    return !!el.closest('[aria-hidden="true"]');
  }

  function isClippedAway(el) {
    var cs = css(el);
    if (cs.clip && CLIP_ZERO.test(cs.clip)) return true;
    if (cs.clipPath && CLIP_PATH_COLLAPSED.test(cs.clipPath)) return true;
    var r = el.getBoundingClientRect();
    return r.width <= 1 && r.height <= 1 && (cs.overflow === 'hidden' || cs.overflowX === 'hidden');
  }

  function isVisuallyHidden(el) {
    for (var node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (isClippedAway(node)) return true;
    }
    return false;
  }

  function isPreviewChrome(el) {
    return !!el.closest(PREVIEW_CHROME_SELECTOR);
  }

  function intersects(a, b) {
    var w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    var h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? { width: w, height: h } : null;
  }

  function unionRect(rects) {
    var u = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    rects.forEach(function (r) {
      u.left = Math.min(u.left, r.left);
      u.top = Math.min(u.top, r.top);
      u.right = Math.max(u.right, r.right);
      u.bottom = Math.max(u.bottom, r.bottom);
    });
    u.width = u.right - u.left;
    u.height = u.bottom - u.top;
    return u;
  }

  function parseAlpha(color) {
    var m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) return color === 'transparent' ? 0 : 1;
    var parts = m[1].split(/[ ,\/]+/).filter(Boolean);
    return parts.length >= 4 ? Number(parts[3]) : 1;
  }

  function validateThresholds(th) {
    if (!th || typeof th !== 'object') throw new Error('registry probes need a thresholds object (' + THRESHOLD_KEYS.join(', ') + ')');
    var out = {};
    THRESHOLD_KEYS.forEach(function (key) {
      var v = th[key];
      if (typeof v !== 'number' || !isFinite(v) || v <= 0) throw new Error('thresholds.' + key + ' must be a positive number (got ' + JSON.stringify(v) + ')');
      out[key] = v;
    });
    return out;
  }

  function containingBlockOrigin(el, pseudoCs) {
    if (pseudoCs.position === 'fixed') return { left: 0, top: 0 };
    var node = el;
    while (node && node !== document.documentElement) {
      if (css(node).position !== 'static') {
        var r = node.getBoundingClientRect();
        return { left: r.left + node.clientLeft, top: r.top + node.clientTop };
      }
      node = node.parentElement;
    }
    var root = document.documentElement.getBoundingClientRect();
    return { left: root.left, top: root.top };
  }

  function pseudoRects(el) {
    var out = [];
    ['::before', '::after'].forEach(function (name) {
      var cs = css(el, name);
      if (!cs.content || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') return;
      if (cs.position !== 'absolute' && cs.position !== 'fixed') return;
      var w = num(cs.width);
      var h = num(cs.height);
      var left = num(cs.left);
      var top = num(cs.top);
      if (!w || !h || left === null || top === null) return;
      var origin = containingBlockOrigin(el, cs);
      var l = origin.left + left + (num(cs.marginLeft) || 0);
      var t = origin.top + top + (num(cs.marginTop) || 0);
      out.push({ left: l, top: t, right: l + w, bottom: t + h, width: w, height: h });
    });
    return out;
  }

  function hitRectOf(el, box) {
    var rects = [box].concat(pseudoRects(el));
    return rects.length === 1 ? box : unionRect(rects);
  }

  function isInlineTextLink(el) {
    if (el.tagName !== 'A' || css(el).display !== 'inline') return false;
    var parent = el.parentElement;
    if (!parent) return false;
    return parent.textContent.replace(el.textContent, '').trim().length > 0;
  }

  function collectControls(roots) {
    var seen = new Set();
    var out = [];
    roots.forEach(function (root) {
      root.querySelectorAll(CONTROL_SELECTOR).forEach(function (el) {
        if (seen.has(el)) return;
        seen.add(el);
        if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert]')) return;
        if (!isVisible(el)) return;
        var box = rectOf(el);
        if (isTiny(box) || isInlineTextLink(el)) return;
        out.push({ el: el, box: box, hit: hitRectOf(el, box) });
      });
    });
    return out;
  }

  function closeNameOf(el) {
    var text = (el.textContent || '').trim();
    var names = [el.getAttribute('aria-label'), el.getAttribute('title'), text.length <= 20 ? text : null, el.getAttribute('data-action'), el.id];
    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      if (name && (CLOSE_PATTERN.test(name) || CLOSE_GLYPH.test(name))) return name;
    }
    return null;
  }

  function closeControlsIn(container) {
    var out = [];
    container.querySelectorAll('button,a,[role="button"],[data-action]').forEach(function (el) {
      if (!isVisible(el) || !closeNameOf(el)) return;
      out.push(el);
    });
    return out;
  }

  function probeFontSize(ctx) {
    var out = [];
    var seen = new Set();
    ctx.roots.forEach(function (root) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var parent = node.parentElement;
        if (!parent || seen.has(parent) || SKIP_TEXT_PARENTS.test(parent.tagName)) continue;
        if (!/\S/.test(node.nodeValue)) continue;
        if (!isVisible(parent)) continue;
        var box = rectOf(parent);
        if (isTiny(box)) continue;
        var size = num(css(parent).fontSize);
        if (size !== null && size < ctx.th.minTextPx) {
          seen.add(parent);
          out.push({ slug: 'min-font-size', selector: selectorOf(parent), detail: 'font-size ' + px(size) + ' < ' + ctx.th.minTextPx + 'px: "' + node.nodeValue.trim().slice(0, 40) + '"' });
        }
      }
    });
    return out;
  }

  function probeControlHeightBand(ctx) {
    var out = [];
    var controls = ctx.controls();
    var groups = new Map();
    controls.forEach(function (c) {
      var tag = c.el.tagName;
      var role = c.el.getAttribute('role');
      var buttonLike = tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || role === 'button' || role === 'tab' || (tag === 'A' && css(c.el).display !== 'inline');
      var first = classText(c.el).split(/\s+/).filter(Boolean)[0];
      if (!buttonLike || !first || !c.el.parentElement) return;
      var key = tag + '.' + first;
      var perParent = groups.get(c.el.parentElement) || new Map();
      var list = perParent.get(key) || [];
      list.push(c);
      perParent.set(key, list);
      groups.set(c.el.parentElement, perParent);
    });
    groups.forEach(function (perParent) {
      perParent.forEach(function (list) {
        if (list.length < 2) return;
        var tallest = Math.max.apply(null, list.map(function (c) { return c.box.height; }));
        list.forEach(function (c) {
          if (tallest - c.box.height > 1) {
            out.push({ slug: 'control-height-band', selector: selectorOf(c.el), detail: 'height ' + px(c.box.height) + ' differs from same-role sibling height ' + px(tallest) });
          }
        });
      });
    });
    return out;
  }

  function probeWrappedLabel(ctx) {
    var out = [];
    var seen = new Set();
    ctx.roots.forEach(function (root) {
      root.querySelectorAll(LABEL_SELECTOR).forEach(function (el) {
        if (seen.has(el) || !isVisible(el)) return;
        seen.add(el);
        var ws = css(el).whiteSpace;
        if (ws === 'nowrap' || ws === 'pre') return;
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        var node;
        var worst = 1;
        while ((node = walker.nextNode())) {
          if (!/\S/.test(node.nodeValue)) continue;
          var range = document.createRange();
          range.selectNodeContents(node);
          var tops = [];
          Array.prototype.forEach.call(range.getClientRects(), function (r) {
            if (r.height <= 0 || r.width <= 0) return;
            if (!tops.some(function (t) { return Math.abs(t - r.top) < r.height / 2; })) tops.push(r.top);
          });
          worst = Math.max(worst, tops.length);
        }
        if (worst > 1) out.push({ slug: 'wrapped-label', selector: selectorOf(el), detail: 'label "' + el.textContent.trim().slice(0, 40) + '" wraps onto ' + worst + ' lines' });
      });
    });
    return out;
  }

  function probeTapTarget(ctx) {
    var out = [];
    var th = ctx.th;
    ctx.controls().forEach(function (c) {
      if (Math.min(c.hit.width, c.hit.height) < th.minTapHitPx) {
        out.push({ slug: 'tap-target-hit-area', selector: selectorOf(c.el), detail: 'hit area ' + px(c.hit.width) + ' x ' + px(c.hit.height) + ' < ' + th.minTapHitPx + 'px (box ' + px(c.box.width) + ' x ' + px(c.box.height) + ')' });
      }
    });
    return out;
  }

  function probeIconStroke(ctx) {
    var icons = [];
    ctx.roots.forEach(function (root) {
      root.querySelectorAll('svg').forEach(function (svg) {
        if (!isVisible(svg)) return;
        var box = rectOf(svg);
        var vb = svg.viewBox && svg.viewBox.baseVal;
        if (!vb || !vb.width || box.width > 64 || box.width < 8) return;
        var strokeWidth = null;
        svg.querySelectorAll('path,circle,line,polyline,polygon,rect,ellipse').forEach(function (node) {
          if (strokeWidth !== null) return;
          var cs = css(node);
          if (cs.stroke === 'none' || cs.stroke === 'transparent') return;
          var fill = cs.fill;
          if (fill !== 'none' && parseAlpha(fill) > 0.02) return;
          var w = num(cs.strokeWidth);
          if (w === null || w <= 0) return;
          strokeWidth = w;
        });
        if (strokeWidth === null) return;
        icons.push({ el: svg, rendered: strokeWidth * (box.width / vb.width) });
      });
    });
    if (icons.length < 2) return [];
    var counts = new Map();
    icons.forEach(function (i) {
      var key = Math.round(i.rendered * 4) / 4;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    var modal = null;
    counts.forEach(function (count, key) {
      if (modal === null || count > counts.get(modal)) modal = key;
    });
    var out = [];
    icons.forEach(function (i) {
      if (Math.abs(i.rendered - modal) > 0.3) {
        out.push({ slug: 'icon-stroke-mismatch', selector: selectorOf(i.el), detail: 'rendered outline stroke ' + px(i.rendered) + ' differs from the theme stroke ' + px(modal) });
      }
    });
    return out;
  }

  function paintlessReason(el) {
    var cs = css(el);
    var op = num(cs.opacity);
    if (op !== null && op < 0.05) return 'opacity ' + op;
    if (PAINTED_TAGS.test(el.tagName)) return null;
    if (parseAlpha(cs.backgroundColor) >= 0.02 || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return null;
    var sides = ['Top', 'Right', 'Bottom', 'Left'];
    for (var i = 0; i < sides.length; i += 1) {
      if (num(cs['border' + sides[i] + 'Width']) > 0 && cs['border' + sides[i] + 'Style'] !== 'none') return null;
    }
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && /\S/.test(n.nodeValue) && parseAlpha(cs.color) >= 0.02) return null;
    }
    if (el.querySelector('img,svg,canvas,video,picture')) return null;
    return 'fully transparent';
  }

  function probeInvisibleBlocker(ctx) {
    var byBlocker = new Map();
    ctx.controls().forEach(function (c) {
      var r = c.box;
      var cx = (r.left + r.right) / 2;
      var cy = (r.top + r.bottom) / 2;
      if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) return;
      var top = document.elementFromPoint(cx, cy);
      if (!top || top === c.el || c.el.contains(top) || top.contains(c.el)) return;
      if (top.control === c.el) return;
      var reason = paintlessReason(top);
      if (!reason) return;
      var entry = byBlocker.get(top) || { reason: reason, covered: [] };
      entry.covered.push(c.el);
      byBlocker.set(top, entry);
    });
    var out = [];
    byBlocker.forEach(function (entry, blocker) {
      out.push({ slug: 'invisible-click-blocker', selector: selectorOf(blocker), detail: entry.reason + ' element covers ' + entry.covered.length + ' visible control(s), first ' + selectorOf(entry.covered[0]) });
    });
    return out;
  }

  function isPopupCandidate(el) {
    var cs = css(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    var role = el.getAttribute('role');
    var semantic = role === 'dialog' || role === 'alertdialog' || el.getAttribute('aria-modal') === 'true' || (el.tagName === 'DIALOG' && el.open);
    var named = POPUP_PATTERN.test(el.tagName + ' ' + (el.id || '') + ' ' + classText(el));
    return semantic || named;
  }

  function popupCandidates() {
    var out = [];
    document.body.querySelectorAll('*').forEach(function (el) {
      if (!isPopupCandidate(el) || !isVisible(el)) return;
      if (!inViewport(rectOf(el))) return;
      out.push(el);
    });
    return out;
  }

  function hasContent(el) {
    if ((el.textContent || '').trim()) return true;
    return !!el.querySelector('img,svg,button,a,input,select,textarea');
  }

  function topLevel(list) {
    return list.filter(function (el) {
      return !list.some(function (other) { return other !== el && other.contains(el); });
    });
  }

  function occludedByAny(cands) {
    var targets = [];
    document.body.querySelectorAll(CONTROL_SELECTOR).forEach(function (el) {
      if (cands.some(function (c) { return c.contains(el); }) || !isVisible(el)) return;
      var r = rectOf(el);
      if (!isTiny(r)) targets.push(r);
    });
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode()) && targets.length < 600) {
      var parent = node.parentElement;
      if (!parent || SKIP_TEXT_PARENTS.test(parent.tagName) || !/\S/.test(node.nodeValue)) continue;
      if (isAriaHidden(parent) || cands.some(function (c) { return c.contains(parent); }) || !isVisible(parent)) continue;
      var range = document.createRange();
      range.selectNodeContents(node);
      var rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) targets.push(rect);
    }
    for (var i = 0; i < targets.length; i += 1) {
      var cx = (targets[i].left + targets[i].right) / 2;
      var cy = (targets[i].top + targets[i].bottom) / 2;
      if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) continue;
      var hit = document.elementFromPoint(cx, cy);
      if (hit && cands.some(function (c) { return c.contains(hit); })) return true;
    }
    return false;
  }

  function probePopups(ctx) {
    var cands = ctx.popups;
    if (!cands.length) return [];
    var tops = topLevel(cands);
    var content = tops.filter(hasContent);
    var occluded = occludedByAny(cands);
    var out = [];
    content.forEach(function (el) {
      var dismissible = closeControlsIn(el).length > 0;
      if (occluded || !dismissible) {
        var why = [];
        if (occluded) why.push('covers page content');
        if (!dismissible) why.push('has no visible close control (aria-label, title, text or data-action)');
        out.push({ slug: 'timed-popup-occluder', selector: selectorOf(el), detail: 'popup open without user action: ' + why.join(' and ') });
      }
    });
    if (!content.length && occluded) {
      out.push({ slug: 'timed-popup-occluder', selector: selectorOf(tops[0]), detail: 'backdrop open without user action covers page content and offers nothing to dismiss' });
    }
    return out;
  }

  function isStuck(el, cs, rect) {
    if (cs.position === 'fixed') return true;
    var top = num(cs.top);
    if (top !== null && Math.abs(rect.top - top) <= 1) return true;
    var bottom = num(cs.bottom);
    return bottom !== null && Math.abs(window.innerHeight - rect.bottom - bottom) <= 1;
  }

  function probeSticky(ctx) {
    var layers = [];
    document.body.querySelectorAll('*').forEach(function (el) {
      var cs = css(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      if (cs.pointerEvents === 'none' || !isVisible(el)) return;
      var rect = rectOf(el);
      if (isTiny(rect) || !inViewport(rect)) return;
      layers.push({ el: el, cs: cs, rect: rect, stuck: isStuck(el, cs, rect) });
    });
    var headers = layers.filter(function (l) {
      var top = num(l.cs.top);
      return l.stuck && top !== null && top <= 1 && l.rect.width >= window.innerWidth * 0.6 && l.rect.height <= window.innerHeight * 0.4;
    });
    if (!headers.length) return [];
    var out = [];
    layers.forEach(function (l) {
      if (!l.stuck || isPopupCandidate(l.el)) return;
      if (headers.some(function (h) { return h.el === l.el || h.el.contains(l.el) || l.el.contains(h.el); })) return;
      for (var i = 0; i < headers.length; i += 1) {
        var overlap = intersects(l.rect, headers[i].rect);
        if (overlap && overlap.width >= 4 && overlap.height >= 4) {
          out.push({ slug: 'sticky-released-occluder', selector: selectorOf(l.el), detail: 'stuck ' + l.cs.position + ' element at top ' + px(l.rect.top) + ' overlaps ' + px(overlap.width) + ' x ' + px(overlap.height) + ' of sticky header ' + selectorOf(headers[i].el) });
          return;
        }
      }
    });
    return out;
  }

  function probeTextOverlap(ctx) {
    var lines = [];
    ctx.roots.forEach(function (root) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var parent = node.parentElement;
        if (!parent || SKIP_TEXT_PARENTS.test(parent.tagName) || !/\S/.test(node.nodeValue)) continue;
        if (isAriaHidden(parent) || !isVisible(parent) || isVisuallyHidden(parent) || isPreviewChrome(parent)) continue;
        var cs = css(parent);
        if (parseAlpha(cs.color) < 0.05) continue;
        var range = document.createRange();
        range.selectNodeContents(node);
        Array.prototype.forEach.call(range.getClientRects(), function (r) {
          if (r.width < 2 || r.height < 2 || !inViewport(r)) return;
          lines.push({ parent: parent, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } });
        });
      }
    });
    lines.sort(function (a, b) { return a.rect.top - b.rect.top; });
    var out = [];
    var reported = new Set();
    for (var i = 0; i < lines.length; i += 1) {
      for (var j = i + 1; j < lines.length && lines[j].rect.top < lines[i].rect.bottom; j += 1) {
        var a = lines[i];
        var b = lines[j];
        if (a.parent === b.parent || a.parent.contains(b.parent) || b.parent.contains(a.parent)) continue;
        var overlap = intersects(a.rect, b.rect);
        if (!overlap) continue;
        var smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
        if (overlap.width * overlap.height < smaller * 0.3) continue;
        var cx = Math.max(a.rect.left, b.rect.left) + overlap.width / 2;
        var cy = Math.max(a.rect.top, b.rect.top) + overlap.height / 2;
        var hit = document.elementFromPoint(cx, cy);
        if (!hit || !(a.parent.contains(hit) || b.parent.contains(hit))) continue;
        var key = selectorOf(a.parent) + '|' + selectorOf(b.parent);
        if (reported.has(key)) continue;
        reported.add(key);
        out.push({ slug: 'text-overlap', selector: selectorOf(a.parent), detail: 'text overlaps text of ' + selectorOf(b.parent) + ' by ' + px(overlap.width) + ' x ' + px(overlap.height) });
      }
    }
    return out;
  }

  var PROBE_FNS = {
    'min-font-size': probeFontSize,
    'control-height-band': probeControlHeightBand,
    'wrapped-label': probeWrappedLabel,
    'tap-target-hit-area': probeTapTarget,
    'icon-stroke': probeIconStroke,
    'invisible-click-blocker': probeInvisibleBlocker,
    'timed-popup-occluder': probePopups,
    'sticky-released-occluder': probeSticky,
    'text-overlap': probeTextOverlap
  };

  function makeContext(th, roots) {
    var cache = null;
    return {
      th: th,
      roots: roots,
      popups: [],
      controls: function () {
        if (!cache) cache = collectControls(roots);
        return cache;
      }
    };
  }

  function runProbes(th, names, roots, popups) {
    var ctx = makeContext(th, roots);
    ctx.popups = popups;
    var findings = [];
    names.forEach(function (name) {
      if (!PROBE_FNS[name]) throw new Error('unknown registry probe ' + name);
      findings = findings.concat(PROBE_FNS[name](ctx));
    });
    return findings;
  }

  function withPopupsHidden(popups, fn) {
    var tops = topLevel(popups);
    var saved = tops.map(function (el) { return { el: el, value: el.style.getPropertyValue('display'), priority: el.style.getPropertyPriority('display') }; });
    saved.forEach(function (s) { s.el.style.setProperty('display', 'none', 'important'); });
    try {
      return fn();
    } finally {
      saved.forEach(function (s) {
        if (s.value) s.el.style.setProperty('display', s.value, s.priority);
        else s.el.style.removeProperty('display');
      });
    }
  }

  function run(thresholds, options) {
    var th = validateThresholds(thresholds);
    var opts = options || {};
    var names = opts.probes || PAGE_PROBES;
    var popups = popupCandidates();
    var findings = [];
    if (names.indexOf('timed-popup-occluder') !== -1) findings = findings.concat(runProbes(th, ['timed-popup-occluder'], [document.body], popups));
    var rest = names.filter(function (n) { return n !== 'timed-popup-occluder'; });
    var body = function () { return runProbes(th, rest, [document.body], popups); };
    findings = findings.concat(popups.length ? withPopupsHidden(popups, body) : body());
    return { findings: findings, ran: names.slice(), popups: popups.length, viewport: { width: window.innerWidth, height: window.innerHeight } };
  }

  function hidePopups() {
    var tops = topLevel(popupCandidates());
    tops.forEach(function (el) { el.style.setProperty('display', 'none', 'important'); });
    return tops.length;
  }

  function positionedVisible() {
    var out = [];
    document.body.querySelectorAll('*').forEach(function (el) {
      var cs = css(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
      if (!isVisible(el) || isPreviewChrome(el)) return;
      out.push(el);
    });
    return out;
  }

  function inFixedContext(el) {
    for (var node = el; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (css(node).position === 'fixed') return true;
    }
    return false;
  }

  function markOverlayBaseline() {
    var seen = new Map();
    positionedVisible().forEach(function (el) { seen.set(el, inViewport(rectOf(el))); });
    state.baseline = seen;
    return seen.size;
  }

  function newOverlayPanels() {
    if (!state.baseline) throw new Error('markOverlayBaseline() must run before reading overlay panels');
    var baseline = state.baseline;
    var fresh = positionedVisible().filter(function (el) {
      if (!inViewport(rectOf(el))) return false;
      if (!baseline.has(el)) return true;
      return baseline.get(el) === false && inFixedContext(el);
    });
    return fresh.filter(function (el) {
      return (el.textContent || '').trim() || el.querySelector('img,svg,button,a,input,select,textarea');
    });
  }

  function hidePreviewChrome() {
    var hidden = 0;
    document.querySelectorAll(PREVIEW_CHROME_SELECTOR).forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
      hidden += 1;
    });
    return hidden;
  }

  function overlayFit() {
    var panels = newOverlayPanels();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var out = [];
    panels.forEach(function (el) {
      var r = rectOf(el);
      if (r.top < -1 || r.left < -1 || r.bottom > vh + 1 || r.right > vw + 1) {
        out.push({ slug: 'overlay-viewport-cap', selector: selectorOf(el), detail: 'panel ' + px(r.width) + ' x ' + px(r.height) + ' at (' + px(r.left) + ', ' + px(r.top) + ') exceeds the ' + vw + ' x ' + vh + ' viewport' });
      }
    });
    return { findings: out, panels: panels.length };
  }

  function overlayScopedRun(thresholds) {
    var th = validateThresholds(thresholds);
    var panels = topLevel(newOverlayPanels());
    if (!panels.length) return { findings: [], panels: 0 };
    return { findings: runProbes(th, SCOPED_PROBES, panels, []), panels: panels.length };
  }

  function dispatchEscape() {
    var target = document.activeElement || document.body;
    ['keydown', 'keyup'].forEach(function (type) {
      var init = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
      target.dispatchEvent(new KeyboardEvent(type, init));
      if (target !== document) document.dispatchEvent(new KeyboardEvent(type, init));
    });
    return true;
  }

  function overlayStillOpen() {
    return newOverlayPanels().length;
  }

  function describeCloseControl(el, panels) {
    var r = rectOf(el);
    var area = r.width * r.height;
    var viewportArea = window.innerWidth * window.innerHeight;
    var inPanel = panels.some(function (p) { return p !== el && p.contains(el); });
    return { fullViewport: area >= viewportArea * 0.8, inPanel: inPanel, area: area };
  }

  function findCloseControls() {
    var panels = newOverlayPanels();
    var out = [];
    closeControlsIn(document.body).forEach(function (el) {
      var d = describeCloseControl(el, panels);
      var r = rectOf(el);
      out.push({ index: out.length, selector: selectorOf(el), fullViewport: d.fullViewport, inPanel: d.inPanel, area: d.area, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    out.sort(function (a, b) {
      if (a.fullViewport !== b.fullViewport) return a.fullViewport ? 1 : -1;
      if (a.inPanel !== b.inPanel) return a.inPanel ? -1 : 1;
      return a.area - b.area;
    });
    return out;
  }

  var api = {
    thresholdKeys: THRESHOLD_KEYS,
    pageProbes: PAGE_PROBES,
    slugOfProbe: SLUG_OF_PROBE,
    run: run,
    hidePopups: hidePopups,
    hidePreviewChrome: hidePreviewChrome,
    markOverlayBaseline: markOverlayBaseline,
    overlayFit: overlayFit,
    overlayScopedRun: overlayScopedRun,
    overlayStillOpen: overlayStillOpen,
    findCloseControls: findCloseControls,
    dispatchEscape: dispatchEscape
  };
  window.__registryProbes = api;
  return { installed: true, probes: PAGE_PROBES.concat(['overlay-fit']) };
})()
