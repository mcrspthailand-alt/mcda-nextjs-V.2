import type { ReactNode } from 'react';
import MembershipBenefits from '@/components/MembershipBenefits';

export default function BillingLayout({ children }: { children: ReactNode }) {
  return <><MembershipBenefits />{children}</>;
}
