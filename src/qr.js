import qrcode from 'qrcode-generator';

export function trackingUrl(reference) {
  return window.location.origin + window.location.pathname + '#/suivi/' + encodeURIComponent(reference);
}

export function qrDataUrl(value) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  return qr.createDataURL(3, 0);
}
