/**
 * Normalizes a phone number to standard E.164 format for India (+91)
 * Strips spaces, dashes, and ensures country code is present.
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove all non-numeric characters (spaces, dashes, parens, plus sign)
  let numericPhone = phone.replace(/\D/g, '');
  
  if (!numericPhone) return '';

  // If the number is exactly 10 digits, assume it's an Indian mobile number
  if (numericPhone.length === 10) {
    numericPhone = '91' + numericPhone;
  }
  
  // Note: if someone enters "09876543210" (11 digits starting with 0), 
  // you might want to handle it. For now, assuming +91 or 10-digit formats.
  if (numericPhone.length === 11 && numericPhone.startsWith('0')) {
    numericPhone = '91' + numericPhone.substring(1);
  }

  return '+' + numericPhone;
}
