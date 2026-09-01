export interface GuardianChildData {
  name: string;
  schoolName: string;
  pickupAreaName: string;
  gender?: string;
}

export interface GuardianRegistrationData {
  firstName: string;
  lastName: string;
  nationalId: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  children: GuardianChildData[];
}

const NAME_RE = /^.{2,20}$/;
const CHILD_NAME_RE = /^.{2,60}$/;
const NATIONAL_ID_RE = /^\d{14}$/;
const PHONE_RE = /^01[0-2,5]{1}[0-9]{8}$/;

export function validateGuardianRegistration(data: GuardianRegistrationData): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.firstName?.trim() || !NAME_RE.test(data.firstName.trim())) {
    errors.push('First name must be 2-20 characters.');
  }
  if (!data.lastName?.trim() || !NAME_RE.test(data.lastName.trim())) {
    errors.push('Last name must be 2-20 characters.');
  }
  if (!NATIONAL_ID_RE.test(data.nationalId?.trim() || '')) {
    errors.push('National ID must be exactly 14 digits.');
  }
  if (!PHONE_RE.test(data.phoneNumber?.trim() || '')) {
    errors.push('Please enter a valid Egyptian phone number.');
  }
  if (!data.password || data.password.length < 6) {
    errors.push('Password must be at least 6 characters.');
  }
  if (data.password !== data.confirmPassword) {
    errors.push('Passwords do not match.');
  }

  if (!Array.isArray(data.children) || data.children.length === 0) {
    errors.push('Please add at least one child.');
  } else {
    data.children.forEach((c, i) => {
      const n = i + 1;
      if (!c.name?.trim() || !CHILD_NAME_RE.test(c.name.trim())) {
        errors.push(`Child ${n}: name must be 2-60 characters.`);
      }
      if (!c.schoolName?.trim()) {
        errors.push(`Child ${n}: please select a school.`);
      }
      if (!c.pickupAreaName?.trim()) {
        errors.push(`Child ${n}: please select a pickup area.`);
      }
    });
  }

  return { isValid: errors.length === 0, errors };
}
