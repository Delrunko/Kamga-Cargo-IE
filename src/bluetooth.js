const SERVICES = ['0000ffe0-0000-1000-8000-00805f9b34fb', '000018f0-0000-1000-8000-00805f9b34fb'];
const CHARACTERISTICS = ['0000ffe1-0000-1000-8000-00805f9b34fb', '00002af1-0000-1000-8000-00805f9b34fb'];

export function bluetoothAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

export async function connectPrinter() {
  if (!bluetoothAvailable()) throw new Error('Bluetooth Web n’est pas pris en charge par ce navigateur. Utilisez l’impression classique.');
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
  const server = await device.gatt.connect();
  for (const serviceId of SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceId);
      const characteristics = await service.getCharacteristics();
      const characteristic = characteristics.find(c => CHARACTERISTICS.includes(c.uuid) && (c.properties.write || c.properties.writeWithoutResponse));
      if (characteristic) return { device, characteristic };
    } catch (error) {
      if (error.name !== 'NotFoundError') throw error;
    }
  }
  device.gatt.disconnect();
  throw new Error('Aucun service d’impression BLE compatible (FFE0/FFE1 ou 18F0) n’a été trouvé.');
}

export function receiptBytes(doc) {
  const clean = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
  const lines = [
    'KAMGA CARGO',
    'RECU N. ' + doc.numero,
    'Date: ' + doc.date,
    'Client: ' + doc.nom,
    'Reference: ' + doc.ref,
    'Montant: ' + doc.avance + ' FCFA',
    doc.fraisMagasinage ? 'Magasinage: ' + doc.fraisMagasinage + ' FCFA' : '',
    doc.remiseMagasinage ? 'Remise: ' + doc.remiseMagasinage + ' FCFA' : '',
    'Mode: ' + (doc.modePaiement || '-'),
    'Reste: ' + (doc.reste ?? ((doc.totalDu ?? doc.montant) - doc.avance)) + ' FCFA',
    doc.annule ? '*** ANNULE ***' : '',
    '\n\n'
  ].filter(Boolean);
  const text = lines.map(clean).join('\n');
  const encoded = new TextEncoder().encode(text);
  return new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x01, ...encoded, 0x1d, 0x56, 0x00]);
}

export async function printReceiptBluetooth(doc, connection, testMode = false) {
  const bytes = receiptBytes(doc);
  if (testMode) return bytes;
  if (!connection?.characteristic) throw new Error('Connectez d’abord une imprimante Bluetooth.');
  const characteristic = connection.characteristic;
  const size = 20;
  for (let i = 0; i < bytes.length; i += size) {
    const chunk = bytes.slice(i, i + size);
    if (characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
    else await characteristic.writeValue(chunk);
  }
  return bytes;
}

export const bytesAsHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
