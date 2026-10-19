const ThemeUtils = {
  t(key) {
    const strings = (window.themeConfig && window.themeConfig.strings) || {};
    return strings[key] || '';
  }
};
const failed = ThemeUtils.t('cart_error');
if (failed) showToast(failed);
const order = { 'Tên công ty': 'x' };
if (state === 'Hết hàng') showToast(failed);
console.warn('Không tải được dữ liệu');
// Chú thích tiếng Việt trong mã nguồn
