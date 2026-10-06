// The one place the app names where a person can get help with their own
// Medicaid case. These are contacts someone in difficulty will call: change a
// name, number, hours or link only after reading it on the official page named
// beside it, then update the date below. Never fill a field from memory.
//
// Last verified: 2026-10-05 (each field read from its source page that day).
// Owner review: approved 2026-10-06 (SAFE-12, issue #241).
export const GET_HELP_LAST_VERIFIED = '2026-10-05';

/** Public page that shows the full block; linked beside Terms and Privacy. */
export const GET_HELP_PATH = '/get-help';

/** Who makes the decision this tool cannot make. Shown wherever the app used
 *  to say "Verify critical details with NC DHHS". */
export const WHO_DECIDES = 'Your county DSS or your health plan decides your case.';

/** Always on screen: the composer helper line, the site footer and the Get
 *  help block. The agent's off-topic notice (scope-gate.ts) ends with the same
 *  sentence; keep the two in step. */
export const CRISIS_LINE =
  'In an emergency call 911. Thinking about suicide or in crisis? Call or text 988.';

export interface HelpContact {
  id: 'county-dss' | 'ombudsman' | 'legal-aid';
  name: string;
  /** One short sentence on when to use this contact. */
  description: string;
  /** Printed phone number, or absent when there is no single number. */
  phone?: string;
  /** Digits for the tel: link. */
  tel?: string;
  hours?: string;
  url: string;
  linkLabel: string;
}

export const GET_HELP_CONTACTS: readonly HelpContact[] = [
  {
    id: 'county-dss',
    // Source (name, link): https://www.ncdhhs.gov/divisions/social-services/local-dss-directory
    // "Each of North Carolina's 100 counties has a local social services
    // agency." There is no single statewide number, so none is listed here.
    name: 'Your county Department of Social Services (DSS)',
    description: 'Your county DSS office handles your Medicaid case.',
    url: 'https://www.ncdhhs.gov/divisions/social-services/local-dss-directory',
    linkLabel: 'Find your county DSS office',
  },
  {
    id: 'ombudsman',
    // Source (name, phone, hours, link): https://medicaid.ncdhhs.gov/about-nc-medicaid/nc-medicaid-ombudsman
    // "To contact the NC Medicaid Ombudsman, call 1-877-201-3750 from 8 a.m.
    // to 5 p.m., Monday through Friday except for State holidays."
    // https://ncmedicaidombudsman.org/ redirects (301) to this page. The
    // 866 number on the same page is for providers; do not use it here.
    name: 'NC Medicaid Ombudsman',
    description:
      'Call if you have questions about a notice or a bill, or you are not getting the care you need.',
    phone: '1-877-201-3750',
    tel: '+18772013750',
    hours: 'Monday to Friday, 8 a.m. to 5 p.m., except State holidays',
    url: 'https://medicaid.ncdhhs.gov/about-nc-medicaid/nc-medicaid-ombudsman',
    linkLabel: 'NC Medicaid Ombudsman website',
  },
  {
    id: 'legal-aid',
    // Source (name, phone, hours, link): https://legalaidnc.org/apply/
    // "Legal Aid NC Helpline. Toll-Free: 1 (866) 219-LANC (5262). 9:00 AM –
    // 3:00 PM, Monday – Friday. Apply for free help with civil (non-criminal)
    // legal issues." The other helplines on that page (seniors, insurance
    // sign-up, fair housing, immigration) are not this one.
    // Source (description): https://legalaidnc.org/get-help/ ("free legal
    // help to low-income North Carolinians in civil cases"; Government
    // Benefits covers "Social Security benefits, Medicaid, Medicare, food
    // stamps and more").
    name: 'Legal Aid of North Carolina Helpline',
    description: 'Free legal help with Medicaid and other benefits, for people with low income.',
    phone: '1-866-219-5262',
    tel: '+18662195262',
    hours: 'Monday to Friday, 9 a.m. to 3 p.m.',
    url: 'https://legalaidnc.org/apply/',
    linkLabel: 'Apply for help from Legal Aid of NC',
  },
];
