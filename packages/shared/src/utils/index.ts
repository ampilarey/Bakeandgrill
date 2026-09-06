// Shared utility functions
export const formatCurrency = (amount: number, currency: string = 'MVR'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

export const formatDate = (date: Date | string): string => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
};

export * from './serviceCharge';
export * from './smsCharCount';
export * from './deliveryFeeEstimate';
export * from './effectiveDiscount';
export * from './feeTax';
export * from './itemDescription';
export * from './businessDay';
export * from './platterRules';
