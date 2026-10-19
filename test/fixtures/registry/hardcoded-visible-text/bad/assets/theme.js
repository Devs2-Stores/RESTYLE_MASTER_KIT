const ThemeUtils = {
  t(key) {
    const strings = (window.themeConfig && window.themeConfig.strings) || {};
    return strings[key] || '';
  }
};
const failed = ThemeUtils.t('cart_error', 'Literal');
const emptyText = 'Giỏ hàng của bạn đang trống';
showToast(emptyText);
