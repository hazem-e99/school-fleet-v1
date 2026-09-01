// Login Validation Utility — phone number + password.

export interface LoginData {
  phoneNumber: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginValidationResult {
  isValid: boolean;
  errors: string[];
}

const PHONE_RE = /^01[0-2,5]{1}[0-9]{8}$/;

export const validateLogin = (data: LoginData): LoginValidationResult => {
  const errors: string[] = [];

  if (!data.phoneNumber?.trim()) {
    errors.push('Phone number is required');
  } else if (!PHONE_RE.test(data.phoneNumber.trim())) {
    errors.push('Please enter a valid Egyptian phone number');
  }

  if (!data.password?.trim()) {
    errors.push('Password is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const validatePhoneNumber = (phone: string): boolean => PHONE_RE.test(phone);

export const validatePassword = (password: string): boolean => password.length >= 1;
