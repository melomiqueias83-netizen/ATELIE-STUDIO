function normalizeAscii(input: string, maxLen: number): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 .\-@]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixPayloadOptions {
  pixKey: string;
  amount: number;
  recipientName: string;
  recipientCity: string;
  txid?: string;
}

/**
 * Generates an official Brazilian PIX EMV BR Code ("Pix Copia e Cola")
 * with CRC-16/CCITT-FALSE checksum and enforced minimum amount of R$ 0,99.
 */
export function buildPixPayload({
  pixKey,
  amount,
  recipientName,
  recipientCity,
  txid = 'ATELIERCLUB',
}: PixPayloadOptions): string {
  const safeKey = pixKey.trim().slice(0, 99) || 'miqueiasmelouber@gmail.com';
  const safeAmount = Math.max(0.99, Math.round(amount * 100) / 100).toFixed(2);
  const safeName = normalizeAscii(recipientName || 'Atelier Club', 25) || 'Atelier Club';
  const safeCity = normalizeAscii(recipientCity || 'SAO PAULO', 15).toUpperCase() || 'SAO PAULO';
  const safeTxid =
    txid
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 25) || 'ATELIERCLUB';

  const merchantAccountInfo =
    tlv('00', 'br.gov.bcb.pix') + tlv('01', safeKey);

  const additionalDataField = tlv('05', safeTxid);

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') +
    tlv('53', '986') +
    tlv('54', safeAmount) +
    tlv('58', 'BR') +
    tlv('59', safeName) +
    tlv('60', safeCity) +
    tlv('62', additionalDataField) +
    '6304';

  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}

export function formatBrlCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
