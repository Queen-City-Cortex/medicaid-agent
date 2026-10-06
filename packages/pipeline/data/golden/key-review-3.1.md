# Golden answer keys: review list for dataset 3.1

Forty answer keys were reworded in dataset 3.1 (review EVAL-1b, issue #554) so that each asserts only what its cited sections say. A reworded key is a statement of what Medicaid policy says, so none of them is scored until the owner or an attorney approves the wording.

**How to approve a key:** in `dataset.json`, set its `status` to `validated`, delete its `validation_note`, and raise the version in `dataset-version.json` with a line in `CHANGELOG.md`. To change the wording instead, edit `answer.text`; every fact it asserts needs a verbatim entry in `supporting_quotes` from a section the key cites, which `eval-validate-golden` checks.

**What was checked:** every quote is verbatim in its section (checked by `eval-validate-golden`). Each draft was then read against the corpus by a second, independent pass, and its findings were applied. Nobody with legal training has read these.

**Read these three first.** They turn on points of law and needed two rounds of correction, and q-033 and q-049 a third, smaller one: q-021 (medical loss ratio: which contract amendment is operative), q-033 (appeal routes and deadlines for agency and plan denials) and q-049 (the federal authority for EPSDT).

Sources name the document and the section numbers or headings cited. Section numbers in a key's text are the policy's own.

## q-002

**Question.** What DME items are specifically NOT covered by NC Medicaid under the Orthotics and Prosthetics policy, and what general criteria must be met for coverage?

**Original key.** Under Clinical Coverage Policy 5B (Orthotics and Prosthetics), coverage requires that items meet general criteria in section 3.1 including medical necessity and appropriate prescribing. Items not covered are described in section 4.1 general exclusions and 4.2.1 specific exclusions, which include items for comfort or convenience, duplicate devices, and experimental equipment. A beneficiary must first meet general coverage criteria before specific items are evaluated.

**Proposed key.** Under Clinical Coverage Policy 5B (Orthotics and Prosthetics), coverage requires that items meet the general criteria in section 3.1, including medical necessity, and the specific criteria in section 3.2.1, including being ordered by a physician, physician assistant, or nurse practitioner. Items not covered are described in section 4.1 general exclusions and 4.2.1 specific exclusions, which include items for comfort or convenience, duplicate devices, and experimental equipment.

**What the original got wrong or could not support.**

- Section 3.1 includes 'appropriate prescribing' as a general criterion: 3.1 does not mention prescribing or ordering; the ordering requirement is in 3.2.1.
- 'A beneficiary must first meet general coverage criteria before specific items are evaluated': the policy states no such order of evaluation; 4.1 says only that an item is not covered when the Section 3.0 criteria are not met.

**Sources.**

- Clinical Coverage Policy 5B, Orthotics & Prosthetics: 4.1, 4.2.1, 3.1, 3.2.1, 2.2.1

## q-003

**Question.** What are the entrance, continued service, and discharge criteria for outpatient behavioral health services in NC Medicaid?

**Original key.** Clinical Coverage Policy 8C defines behavioral health service criteria across three phases: Entrance criteria (section 3.2.1.1) specify the clinical conditions and functional impairments required for initial authorization. Continued service criteria (section 3.2.1.2) require documented progress or ongoing medical necessity. Discharge criteria (section 3.2.1.3) are met when goals are achieved, patient is stable, or a higher level of care is needed.

**Proposed key.** Clinical Coverage Policy 8C defines outpatient behavioral health service criteria across three phases: Entrance criteria (section 3.2.1.1) must all be met and include a current DSM-5 diagnosis and associated functional impairment. Continued service criteria (section 3.2.1.2) require both an outcome not yet restored, improved or sustained (or relapse risk or tenuous gains) and either achieved goals with additional goals indicated or satisfactory progress with documentation that continued service is expected to be effective. Discharge criteria (section 3.2.1.3) are met when any one applies: functioning has improved with respect to treatment plan goals, the beneficiary or legally responsible person no longer wishes services, or a more appropriate treatment modality is required.

**Caveats, original.** Telephonic service criteria in 3.1.2 may differ; Psychological testing has additional criteria in 3.2.1.4

**Caveats, proposed.** Telephonic services have their own criteria in 3.2.2, referenced from 3.1.2; Psychological testing has additional criteria in 3.2.1.4

**What the original got wrong or could not support.**

- Discharge when 'patient is stable': 3.2.1.3 does not list stability as a discharge criterion.
- Discharge when 'a higher level of care is needed': 3.2.1.3 speaks of a more appropriate treatment modality, not a higher level of care; a higher level of care appears only in the entrance criteria (3.2.1.1).
- Discharge when 'goals are achieved': 3.2.1.3 says functioning has improved with respect to the goals; under 3.2.1.2 achieving current goals can support continued service when further goals are indicated.
- Entrance criteria are 'required for initial authorization': 3.2.1.1 says they are necessary for admission to outpatient treatment services and does not mention authorization.
- Continued service requires 'ongoing medical necessity': that phrase is not in 3.2.1.2, which sets a two-part test.
- Caveat placing telephonic criteria in 3.1.2: 3.1.2 says when telephonic delivery is reserved and sends the reader to 3.2.2 for the telephonic-specific criteria.

**Sources.**

- Clinical Coverage Policy 8C, Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers: 3.2.1.1, 3.2.1.2, 3.2.1.3, 3.2.1, 3.1.2, 3.2.2, 3.2.1.4

## q-006

**Question.** Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?

**Original key.** Chiropractic services are not a covered benefit under Clinical Coverage Policy 5B (Orthotics and Prosthetics). Policy 5B specifically covers orthotic and prosthetic devices and related fitting services. Chiropractic manipulative treatment is a distinct service category not addressed under this policy.

**Proposed key.** Chiropractic services are not a covered benefit under Clinical Coverage Policy 5B (Orthotics and Prosthetics). Policy 5B covers orthotic and prosthetic devices; fitting is included in the payment for a device and is not paid separately. Policy 5B does not mention chiropractic services, which are a distinct service not addressed under this policy.

**Caveats, original.** Chiropractic may be addressed under a separate clinical policy

**Caveats, proposed.** Chiropractic services are addressed under a separate clinical coverage policy, Chiropractic Services

**What the original got wrong or could not support.**

- Policy 5B covers 'related fitting services': 5B says fitting is included in the device payment and is not paid separately; it is not a covered service of its own.
- 'Chiropractic manipulative treatment' as a named service category: the term does not appear in Policy 5B.
- The original evidence (4.1 and 2.1.1) is template text that says nothing about the policy's scope or about chiropractic services.

**Sources.**

- Clinical Coverage Policy 5B, Orthotics & Prosthetics: 1.0, 3.2.1, Orthotics & Prosthetics, H. Reimbursement
- Clinical Coverage Policy 1F, Chiropractic Services: 3.2.1

## q-007

**Question.** What is the treatment plan (plan of care) requirement for outpatient therapy services under NC Medicaid policy 10A?

**Original key.** Clinical Coverage Policy 10A section 3.2.1.6 specifies Treatment Plan (Plan of Care) requirements for outpatient therapy services. A treatment plan must be established, signed, and periodically reviewed by the treating provider. The plan must document the patient's functional deficits, treatment goals, frequency and duration of services, and the expected outcomes.

**Proposed key.** Clinical Coverage Policy 10A section 3.2.1.6 specifies Treatment Plan (Plan of Care) requirements for outpatient therapy services. A treatment plan must be established after the evaluation and before treatment begins, signed by the professional completing it, and reviewed by the service provider at least every six calendar months. The plan, together with the evaluation report, must include, among other elements, the treatment diagnosis, measurable goals, frequency of services, and the plan's duration (no more than six calendar months).

**What the original got wrong or could not support.**

- The plan must document 'the patient's functional deficits': 3.2.1.6 does not list functional deficits; it lists the discipline-specific treatment diagnosis and related medical diagnoses.
- The plan must document 'the expected outcomes': 3.2.1.6 does not list expected outcomes as a plan element; it requires measurable goals.
- 'duration of services': the listed element is the duration of the treatment plan (start and end date, no more than six calendar months), and the elements are required of the plan in combination with the evaluation report.

**Sources.**

- Clinical Coverage Policy 10A, Outpatient Specialized Therapies: 3.2.1.6, Outpatient Specialized Therapy (OST), 3.2.1

## q-008

**Question.** Can a CAP/DA beneficiary transfer between service providers, and what rules govern transfers of eligible beneficiaries?

**Original key.** Yes, CAP/DA beneficiaries may transfer between providers. Clinical Coverage Policy 3K-2 section 3.3 governs transfers of eligible beneficiaries and outlines the process and conditions under which a beneficiary may change their CAP/DA service provider while maintaining continuity of care. The transfer process must comply with NC Medicaid's enrollment and authorization requirements.

**Proposed key.** Yes, a CAP/DA beneficiary may change provider agencies: Clinical Coverage Policy 3K-2 requires a POC update and a signed freedom of choice form consenting to the change in providers. Section 3.3, Transfers of Eligible Beneficiaries, governs a different kind of transfer, to another county or CME: the CME must coordinate it by the agreed transition date or in less than 30 calendar days of the request, preventing gaps in service, and the beneficiary remains eligible for CAP/DA regardless of county of residence.

**Caveats, original.** Specific transfer timelines and administrative steps may be detailed in operational guidance beyond the clinical policy

**Caveats, proposed.** (none)

**What the original got wrong or could not support.**

- Section 3.3 outlines the process and conditions under which a beneficiary may change their CAP/DA service provider (3.3 covers transfers to another county or case management entity, not changes of service provider)
- The transfer process must comply with NC Medicaid's enrollment and authorization requirements (not stated in 3.3 or in the change-of-provider section)
- Caveat that timelines and steps may be detailed in operational guidance beyond the policy (nothing in 3K-2 points to outside guidance for transfers; 3.3 itself gives the timelines and steps)

**Sources.**

- Clinical Coverage Policy 3K-2, Community Alternatives Program for Disabled Adults (CAP/DA): Documenting a change of provider agency:, 3.3, 5.4.2, 3.2.4

## q-009

**Question.** Is there a maximum earned income limit for people on HCWD (Health Coverage for Workers with Disabilities), and what premiums apply?

**Original key.** There is no maximum earned income limit for HCWD. The HCWD Phase III changes (Change Notice for Manual No. 01-14) removed the 150% FPL cap on earned income. The only income limit is 150% FPL on unearned income. Beneficiaries with countable income above 150% FPL must pay a $50 per certification period enrollment fee. Those with countable income above 200% FPL must also pay a sliding-scale monthly premium that increases with income. HCWD covers individuals regardless of total countable income, as long as they are working in competitive, inclusive employment (or self-employed) and meet disability criteria.

**Proposed key.** There is no maximum earned income limit for HCWD. The HCWD changes in Change Notice for Manual No. 01-14 removed the 150% FPL cap on income. The only income limit is 150% FPL on unearned income. Beneficiaries with countable income above 150% FPL must pay a $50 per certification period enrollment fee. Those with countable income above 200% FPL must also pay a sliding-scale monthly premium that increases with income. HCWD covers individuals regardless of total countable income, as long as they are working in competitive, inclusive employment (or self-employed).

**Caveats, original.** Premium amounts are updated periodically — verify current schedule; Work must be competitive and inclusive unless self-employed; SSI must have been terminated for non-medical reasons to qualify

**Caveats, proposed.** Premium amounts are updated periodically — verify current schedule; Work must be competitive and inclusive unless self-employed

**What the original got wrong or could not support.**

- 'removed the 150% FPL cap on earned income': the notice describes removing the 150% FPL income limit / cap on income, not a cap specific to earned income
- 'Phase III': the phrase is in the indexed document title only, not in any section text
- 'and meet disability criteria': the notice does not state disability criteria as a condition in these terms
- Caveat 'SSI must have been terminated for non-medical reasons to qualify': the notice only says section IV.B.2.b. of MA-2180 adds the qualification 'for non-medical reasons' to one provision; it does not say this is a general condition of qualifying

**Sources.**

- CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III: D.  MA-2180, Health Coverage for Workers with Disabilities, is revised in:, I. BACKGROUND, A.  MA-500, Classification, is revised in:, C.  MA-2100, Categorically Needy No Money Payment, is revised in:, DMA CHANGE NOTICE FOR MANUAL 01-14

## q-010

**Question.** What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?

**Original key.** CAP/DA operates under a Section 1915(c) home and community-based services waiver. Section 1915 of the Social Security Act authorizes states to waive certain Medicaid requirements to provide HCBS to individuals who would otherwise require institutional care. Under 42 CFR 441.301, the state's waiver application must describe the services to be provided, the target population, the geographic area, the estimated number of participants, and safeguards to protect health and welfare. 42 CFR 441.303 specifies the supporting documentation required. NC's Clinical Coverage Policy 3K-2 implements the waiver at the state level, defining the specific services, eligibility criteria, and provider requirements.

**Proposed key.** CAP/DA is a Medicaid home and community-based services (HCBS) waiver authorized under Section 1915(c) of the Social Security Act, which authorizes the Secretary of Health and Human Services to waive certain Medicaid statutory requirements so that a state may offer HCBS to target groups of beneficiaries who meet a nursing facility level of care. Under 42 CFR 441.301, the state's waiver request must describe the services to be furnished and the group or groups of individuals to whom they will be offered, and must include the assurances required by 42 CFR 441.302, among them that necessary safeguards protect beneficiaries' health and welfare. 42 CFR 441.303 specifies the supporting documentation required, which includes the number of unduplicated beneficiaries the state intends to serve each year.

**What the original got wrong or could not support.**

- 'the geographic area' as something the waiver request must describe under 42 CFR 441.301: the section has no such requirement (it mentions a geographic area only in a conflict-of-interest exception)
- 'the estimated number of participants' and 'safeguards to protect health and welfare' attributed to 441.301: the number is in 441.303 and the safeguards are a 441.302 assurance (described in 441.303), both of which 441.301(a)(1) incorporates
- 'Section 1915 ... authorizes states to waive certain Medicaid requirements': the statute text is not in the corpus; per Policy 3K-2 and 42 CFR 441.300 it is the Secretary who waives requirements so that states may offer HCBS
- 'Policy 3K-2 ... defining the specific services, eligibility criteria, and provider requirements': rested only on generic section 3.1, which says nothing of the kind

**Sources.**

- 42 CFR Part 441: 441.301, 441.302, 441.303, 441.300
- Clinical Coverage Policy 3K-2, Community Alternatives Program for Disabled Adults (CAP/DA): 1.0, These assurances are:

## q-015

**Question.** What does federal law define as 'home health services' under Medicaid, and where must they be provided?

**Original key.** Under 42 CFR 440.70, 'home health services' must be provided at the beneficiary's place of residence and on orders written by a physician, nurse practitioner, clinical nurse specialist, or physician assistant working in accordance with state law, as part of a written plan of care reviewed every 60 days. The federal definition in SSA Section 1905(a) includes this as a mandatory Medicaid benefit. NC implements this through Clinical Coverage Policy 3A (Home Health Services), which defines the state-specific coverage criteria and provider requirements within the federal framework.

**Proposed key.** Under 42 CFR 440.70, 'home health services' means the services listed there (nursing service, home health aide service, medical supplies, equipment and appliances, and therapy services) provided to a beneficiary at his place of residence and on a practitioner's orders as part of a written plan of care. For nursing, home health aide and therapy services, the orders are written by a physician, nurse practitioner, clinical nurse specialist, or physician assistant working in accordance with state law, and the ordering practitioner reviews the plan of care every 60 days. A beneficiary's place of residence does not include a hospital, nursing facility, or intermediate care facility for individuals with intellectual disabilities (with a limited exception for the last). NC's Clinical Coverage Policy 3A (Home Health Services) states that it has been updated to comply with 42 CFR 440.70.

**Caveats, original.** State policy may be more specific than federal requirements but cannot be more restrictive for mandatory benefits; 'Place of residence' definition may vary — verify current interpretation

**Caveats, proposed.** 'Place of residence' definition may vary — verify current interpretation

**What the original got wrong or could not support.**

- 'The federal definition in SSA Section 1905(a) includes this as a mandatory Medicaid benefit': statute text is not in the corpus, and the validation note says section 1905(a) defines medical assistance without making a service mandatory
- The four-practitioner ordering rule and 60-day review stated for all home health services: 440.70(a)(2) applies them to the services in (b)(1), (2) and (4) only; supplies, equipment and appliances have their own ordering rule in (a)(3)
- 'Policy 3A ... defines the state-specific coverage criteria and provider requirements within the federal framework': not stated in the cited one-line section 3.2.1
- Caveat 'State policy ... cannot be more restrictive for mandatory benefits': not stated in any cited section

**Sources.**

- 42 CFR Part 440: 440.70
- Clinical Coverage Policy 3A, Home Health Services: 5.3.1

## q-017

**Question.** What ambulance services are NOT covered by NC Medicaid?

**Original key.** Under Clinical Coverage Policy 15 (Ambulance Services), Section 4.2.1.4 lists ambulance services that are not covered by Medicaid. Non-covered services include ambulance transport that is not medically necessary, transport for the convenience of the patient or family, transport to a provider's office when other transportation is available and appropriate, and standby or waiting time charges. Air ambulance transport is only covered when ground transport is contraindicated or the distance to the facility makes ground transport impractical.

**Proposed key.** Under Clinical Coverage Policy 15 (Ambulance Services), Section 4.2.1.4 lists other ambulance services that are not covered by Medicaid. Non-covered services include an ambulance that is called when no treatment is needed, a response to a false alarm call, a call where the beneficiary refuses all medical services, transport for a medical service that is not a Medicaid covered service, commercial airline tickets, airstrip fees and waiting fees. Other exclusions in the policy include transport of a beneficiary pronounced dead before the ambulance is called, transport for routine pregnancies, ambulance services for beneficiaries whose Medicaid coverage is through Family Planning, and air medical ambulance transport to a facility that is not an acute-care hospital.

**What the original got wrong or could not support.**

- Section 4.2.1.4 lists transport that is not medically necessary (the section does not say this)
- Transport for the convenience of the patient or family is not covered (no such statement anywhere in Policy 15)
- Transport to a provider's office when other transportation is available is not covered (contradicted: section 3.2.2.1 lists a physician's office as a covered destination, subject to the non-emergency criteria in 3.2.2.2)
- Standby charges are not covered (the section names only waiting fees)
- Air ambulance is covered when distance makes ground transport impractical (section 3.2.1.1 gives no distance test)

**Sources.**

- Clinical Coverage Policy 15, Ambulance Services: 4.2.1.4, 4.2.1.2, 4.2.1.3, 4.2.2.1, 4.0, 5.1, 5.2.2

## q-018

**Question.** Are there quantity limits on prescription drugs under NC Medicaid, and when is prior authorization required for pharmacy claims?

**Original key.** Yes. Under Clinical Coverage Policy 9 (Outpatient Pharmacy), Section 5.4.3 covers quantity and episodic drug limits. Certain drugs have quantity limits per dispensing to minimize costs while ensuring adequate supply. Prior authorization is required for specific drugs listed in the Pharmacy Prior Approval criteria (Attachment K). Section on Pharmacy Prior Approval Drugs and Criteria details the drugs and conditions that trigger prior approval requirements. The prior approval process is designed to ensure appropriate utilization while maintaining access to medically necessary medications.

**Proposed key.** Yes. Under Clinical Coverage Policy 9 (Outpatient Pharmacy), Section 5.4 sets the maximum supply for all drugs at a 34-day supply unless the medication meets one of the listed exceptions. Section 5.4.3 covers quantity and episodic drugs: NC Medicaid may impose quantity limitations for episodic drugs, and for the limits themselves the policy refers to the Preferred Drug List or the specific Prior Authorization policy. Under Section 5.1, Medicaid requires prior authorization for selected prescription drugs. Attachment K (Pharmacy Prior Approval Criteria) introduces the list of prescription drugs that require prior authorization, and the section on Pharmacy Prior Approval Drugs and Criteria lists those drugs and drug classes. The medical necessity criteria for each medication that requires prior approval are published on the NCTracks and NC Medicaid websites rather than in the policy.

**Caveats, original.** The specific drug list and quantity limits change periodically via bulletins; Generic substitution requirements also affect dispensing

**Caveats, proposed.** NC Medicaid monitors utilization of designated episodic drugs annually or more often to assess the need for changes in the limits, and the policy refers to the NCTracks website for a list of drugs that require prior authorization; Generic substitution requirements also affect dispensing

**What the original got wrong or could not support.**

- Quantity limits exist 'to minimize costs while ensuring adequate supply' (no such purpose stated)
- The prior approval process 'is designed to ensure appropriate utilization while maintaining access to medically necessary medications' (no such purpose stated)
- The Pharmacy Prior Approval Drugs and Criteria section details the conditions that trigger prior approval (it is a bare list of drug names; criteria are on the websites)
- Caveat: the drug list and quantity limits change 'via bulletins' (the policy does not say how changes are announced)

**Sources.**

- Clinical Coverage Policy 9, Outpatient Pharmacy Program: 5.4, 5.4.3, 5.1, Pharmacy Prior Approval Drugs and Criteria, Attachment K, 5.8

## q-019

**Question.** Under what conditions can speech therapy be provided via telehealth under NC Medicaid?

**Original key.** Under Clinical Coverage Policy 10A, speech and language evaluation and treatment may be provided via telehealth when it is medically necessary and the beneficiary resides in a remote or underserved area where in-person services are not reasonably available. The telehealth delivery must meet the same clinical standards as in-person services, and the provider must document why telehealth is appropriate for the specific beneficiary's needs.

**Proposed key.** Under Clinical Coverage Policy 10A, select services may be provided via telehealth, and speech-language pathology services are covered when medically necessary. Section 3.1.1 sets the criteria for a beneficiary to receive telehealth services: informed consent for telehealth delivery must be provided by the beneficiary or their legally authorized representative; telehealth must be safe and effective, with a parent, guardian, or caregiver present if necessary; telehealth delivery must not compromise efficacy of care; in-person care must be made available if the beneficiary requests it; and telehealth must be used in the best interest of the beneficiary, not as a convenience for the therapist, and never solely to increase therapist productivity. Only the speech/language codes marked telehealth eligible in Attachment A qualify.

**Caveats, original.** Telehealth policies expanded significantly during COVID-19 and may have been modified since; Not all therapy modalities are appropriate for telehealth delivery; Specific billing codes for telehealth may differ from in-person

**Caveats, proposed.** Not all therapy codes are eligible for telehealth delivery; Telehealth claims must carry modifier GT and are filed with the provider's usual place of service code

**What the original got wrong or could not support.**

- Telehealth requires that the beneficiary reside in a remote or underserved area where in-person services are not reasonably available (no such condition anywhere in Policy 10A)
- The provider must document why telehealth is appropriate for the specific beneficiary (no such requirement in Policy 10A)
- Caveat: telehealth policies expanded during COVID-19 (Policy 10A does not mention COVID-19)
- Caveat: billing codes for telehealth may differ from in-person (the policy uses the same codes with modifier GT and the usual place of service code)

**Sources.**

- Clinical Coverage Policy 10A, Outpatient Specialized Therapies: 3.1.1, Speech/Language Evaluation, Speech/Language Treatment, 3.2.1.3, a. Discharge, Unlisted Procedure or Service, F. Place of Service

## q-020

**Question.** The Non-Emergency Medical Transportation (NEMT) policy has been amended multiple times. Which change notice is the most recent, and what did it change?

**Original key.** In the current DHHS corpus, the latest identifiable NEMT revision is Change No. 04-26, reflected in the MA-3550 manual header 'REVISED 03/16/2026 - CHANGE NO. 04-26.' The companion 04-26 change notice document is present, but its parsed body is title-only in the current graph, so the corpus does not expose a reliable section-level summary of the substantive edits. The retrievable conclusion is therefore that Change No. 04-26 is the most recent visible NEMT amendment, while the exact detailed changes require checking the source notice PDF.

**Proposed key.** In the current DHHS corpus, the latest identifiable NEMT revision is Change No. 04-26, dated March 16, 2026; the MA-2910 manual carries the header 'REVISED 03/16/2026 -CHANGE NO. 04-26.' The corpus holds a 04-26 change notice for each manual, one for the Family and Children's Medicaid manual (MA-3550) and one for the Aged, Blind, and Disabled Medicaid manual (MA-2910). Both notices say the same thing: NC Medicaid updated the charts in the NEMT section for In-State and Out-of-State Per Diem Rates and Mileage Rates. The change is effective upon receipt for all applications processing and ongoing recertifications. The notices name the charts that changed but do not give the old or new rate amounts.

**Caveats, original.** The parsed 04-26 change notice sections are title-only in the current graph; NEMT exists in both MA-3550 and MA-2910 manual variants in the corpus; Use the source change notice PDF if you need the exact text of the 04-26 edits

**Caveats, proposed.** NEMT exists in both MA-3550 and MA-2910 manual variants in the corpus; The 04-26 change notices do not list the rate amounts, so use the rate charts in the manual or the source notice PDF if you need the exact figures

**What the original got wrong or could not support.**

- The 04-26 change notice's parsed body is title-only (contradicted: both 04-26 notices have body text stating what changed)
- The corpus does not expose a summary of the substantive edits (contradicted by the notices' 'Background and Content of Change' sections)
- The header is quoted from MA-3550 section text (in MA-3550 the header survives only as the title of an empty section; the cited section _s2 is also empty)

**Sources.**

- CHANGE NOTICE FOR MANUAL NO. 04-26, Non-Emergency Medical Transportation (NEMT): CHANGE NOTICE FOR MANUAL NO. 04-26, NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT), I. BACKGROUND AND CONTENT OF CHANGE, II. EFFECTIVE DATE AND IMPLEMENTATION
- MA-2910 – NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT): NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)

## q-021 (read first)

**Question.** What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?

**Original key.** Under 42 CFR 438.8, Medicaid managed care organizations must meet medical loss ratio standards. The MLR is calculated as the ratio of clinical services spending to total premium revenue, ensuring that a minimum percentage of premiums is spent on medical care rather than administrative costs or profit. States must set an MLR standard in their managed care contracts. The federal regulation specifies the methodology for calculating the MLR, including what counts as clinical spending vs. administrative costs. NC implements this through its Medicaid managed care contracts and monitors compliance through reporting requirements.

**Proposed key.** Under 42 CFR 438.8, States must ensure through their contracts that each Medicaid managed care plan calculates and reports a medical loss ratio (MLR). It does not itself mandate a minimum: if a State elects to mandate a minimum MLR, it must be equal to or higher than 85 percent, and 42 CFR 438.4(b)(9) requires capitation rates to be developed so that a plan would reasonably achieve an MLR of at least 85 percent. NC implements this through its Medicaid managed care contracts: the Prepaid Health Plan contract requires each plan to calculate and report annually both the CMS-defined MLR and a Department-defined MLR, and sets the minimum MLR threshold in aggregate across all contracted plans at 88 percent. A plan whose Department-defined MLR is below its minimum threshold must remit a rebate to the Department or, with Department approval, put some or all of that amount into health-related resources or public health and Health Equity initiatives.

**Caveats, original.** Specific NC MLR threshold may differ from other states; MLR calculation methodology is complex with many adjustable components; NC's Medicaid managed care transition (Tailored Plans) may have different MLR requirements

**Caveats, proposed.** The 88 percent threshold is an aggregate across all contracted plans; each plan's own threshold is a revenue-weighted figure based on its capitation revenue mix, calculated separately for the Medicaid Expansion and non-Expansion populations; The MLR may be increased by a credibility adjustment (42 CFR 438.8(h)), and the contract adjusts the numerator of the Department-defined MLR; Other plan types have their own contract terms: the BH I/DD Tailored Plan contract, as amended, also sets its minimum MLR threshold at 88 percent, while the Medicaid Direct PIHP contract set 88 percent and its Amendment 1 revised that to 85 percent

**What the original got wrong or could not support.**

- States must set an MLR standard in their managed care contracts (contradicted: 438.8(c) applies a floor only if a State elects to mandate a minimum; what States must require is calculation and reporting)
- The MLR ensures a minimum percentage of premiums is spent on medical care rather than administrative costs or profit (purpose not stated in 438.8)
- NC implements this through its contracts and monitors compliance through reporting (true, but no North Carolina section was cited)
- Caveat: NC's threshold may differ from other states (the corpus says nothing about other states)
- Caveat: Tailored Plans may have different MLR requirements (the Tailored Plan contract sets the same 88 percent threshold)
- Caveat: 'MLR calculation methodology is complex with many adjustable components' ('complex' and 'many' are characterisations no section states; the texts give a credibility adjustment and numerator adjustments)

**Sources.**

- 42 CFR Part 438: 438.8, 438.4
- Contract #30-190029 Prepaid Health Plan Services Amendment 16/17: c. Section V.I. Financial Requirements, 2. Medical Loss Ratio is revised to add the following:
- Contract: aaaa. Section V. I. Financial Requirements, 2. Medical Loss Ratio, d. is revised and restated as follows:, www. Section V. I. Financial Requirements, 2. Medical Loss Ratio, b., iv. is revised and restated as follows:, bbbb. Section  V.  I.  Financial  Requirements,  2.  Medical  Loss  Ratio,  i.  Minimum  Medical  Loss  Ratio  for  Medicaid Expansion Eligible Member Population, i. is revised and restated as follows with no revisions to subparts 1-6:
- Contract--30-190029-DHB-Prepaid-Health-Plan-Services RFP: 2. Medical Loss Ratio
- 30-190029-DHB SP Amendment 25 (26)_Risk Mit_Model (Final): i. Section V. I. Financial Requirements, 2. Medical Loss Ratio, b., i., is revised and restated in its entirety as follows:
- Contract #30-2020-052-DHB-TP Amendment 5/7: ddddd. Section V. B. Medicaid, 7. Financial Requirements, ii. Medical Loss Ratio is revised and restated in its entirety as follows:
- 30-2022-007-DHB MD PIHP Amendment 1 (Model March 2023): wwwww. Section IV. Scope of Services, J. Claims and Encounter Management, 1. Claims is revised to add the following:
- Medicaid Direct Prepaid Inpatient Health Plan Contract: K. Financial Requirements

## q-022

**Question.** What are the specific criteria for NC Medicaid coverage of CAR-T cell therapy?

**Original key.** Clinical Coverage Policy 11A-17 covers CAR-T Cell Therapy under NC Medicaid. Section 3.2.1 specifies the criteria that must be met for Medicaid coverage, including the specific diagnoses for which CAR-T is indicated, the clinical conditions that must be present, and the treatment setting requirements. The therapy must be medically necessary, provided by an approved transplant center, and meet all general Medicaid coverage criteria.

**Proposed key.** Clinical Coverage Policy 11A-17 covers CAR T-Cell Therapy under NC Medicaid. Section 3.2.1 requires that ALL of the following be met: the therapy has received U.S. FDA approval; it is administered per U.S. FDA approved guidelines, including those on indications and usage; and it is administered at a certified or authorized treatment center, which must be enrolled in the REMS program if the therapy is subject to one. The therapy must also be medically necessary under the general criteria in Section 3.1. Section 4.2.1 excludes, among other things, repeat treatment in a beneficiary who has previously received another CAR T-Cell Therapy.

**Caveats, original.** CAR-T coverage criteria evolve rapidly as new products receive FDA approval; Prior authorization is required; Coverage may be limited to specific FDA-approved indications

**Caveats, proposed.** Prior authorization is required; Coverage may be limited to specific FDA-approved indications

**What the original got wrong or could not support.**

- Section 3.2.1 includes 'the specific diagnoses for which CAR-T is indicated' (it names no diagnoses)
- Section 3.2.1 includes 'the clinical conditions that must be present' (it lists no clinical conditions)
- The therapy must be 'provided by an approved transplant center' (the section says 'certified or authorized treatment center')
- Caveat: 'CAR-T coverage criteria evolve rapidly as new products receive FDA approval' (no section says this)

**Sources.**

- Clinical Coverage Policy 11A-17, CAR-T Cell Therapy: 3.2.1, 3.1, 4.2.1, 5.1

## q-023

**Question.** Until what age should physicians provide fluoride varnish applications for Medicaid beneficiaries, and what oral screening requirements apply?

**Original key.** Under Clinical Coverage Policy 1A-23 (Physician Fluoride Varnish Services), Section 7.2 specifies oral screening requirements. Physicians should provide fluoride varnish applications and oral screening as part of preventive care for young children. The screening includes early caries detection and assessment of risk factors. Fluoride varnish is indicated from the eruption of the first tooth until age 3½ years, at which point the child should transition to dental care.

**Proposed key.** Under Clinical Coverage Policy 1A-23 (Physician Fluoride Varnish Services), Section 7.2 specifies oral screening requirements. Physicians should provide fluoride varnish applications and oral screening as preventive procedures for young children. The screening includes early caries screening and detection of notable findings in the oral cavity using a dental mirror and directed light, counseling on good oral hygiene practices and nutrition, and prescribing a fluoride supplement if indicated. Fluoride varnish is applied to all erupted primary teeth, beginning at tooth eruption until the beneficiary is 3½ years of age. Providers shall refer the beneficiary to a dentist for continued treatment at the appropriate age based on the beneficiary's need for dental services.

**Caveats, original.** This covers physician-provided fluoride varnish — dental providers have separate billing; EPSDT may extend preventive dental services beyond standard age limits

**Caveats, proposed.** This covers physician fluoride varnish services, which the policy defines as preventive procedures provided by or under the supervision of a physician; EPSDT may extend preventive dental services beyond standard age limits

**What the original got wrong or could not support.**

- The screening includes 'assessment of risk factors' (not in Section 7.2)
- At age 3½ 'the child should transition to dental care' (Section 7.2 says referral to a dentist is at the appropriate age based on the beneficiary's need, not at 3½)
- Caveat: 'dental providers have separate billing' (the policy does not say this)

**Sources.**

- Clinical Coverage Policy 1A-23, Physician Fluoride Varnish Services: 7.2, 1.0, 3.2.2, 7.3, 5.3, a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]

## q-024

**Question.** Can an NC Innovations waiver participant request services that exceed their individual base budget, and what happens if they believe their needs cannot be met within the budget?

**Original key.** Yes. Under Clinical Coverage Policy 8P (NC Innovations), a participant may request services that cost in excess of their base budget if they believe their needs cannot be met within the base budget. The policy states that the results of the Supports Intensity Scale (SIS) assessment and the base budget are guidelines that do not constitute a binding limit on services. However, the process for obtaining additional funding involves demonstrating that the participant's needs require services beyond what the base budget supports, which may involve additional assessment and authorization from the LME/MCO.

**Proposed key.** Yes. Under Clinical Coverage Policy 8P (NC Innovations), a participant may request services that cost in excess of their base budget if they believe their needs cannot be met within the base budget. The policy states that the results of the Supports Intensity Scale (SIS) assessment and the base budget are guidelines that do not constitute a binding limit on the amount of services that may be requested or authorized. If the LME/MCO determines the requested services to be medically necessary, they will be authorized regardless of the base budget. If a request for authorization is denied, the LME/MCO notifies the individual of the reasons for the decision and how to appeal.

**Caveats, original.** The process for exceeding the base budget is not clearly defined in a single policy section; LME/MCO discretion plays a significant role in budget exception decisions; The distinction between base budget guidelines and binding limits is legally significant but practically ambiguous

**Caveats, proposed.** Services above the base budget remain subject to the waiver's $135,000 cost limit, which may be exceeded only when the policy's criteria are met

**What the original got wrong or could not support.**

- Exceeding the base budget 'may involve additional assessment' (no section says this)
- The process 'involves demonstrating that the participant's needs require services beyond what the base budget supports' (the policy's test is whether the LME/MCO finds the services medically necessary; Attachment F adds that no beneficiary may be required to show more need than others in the same budget category)
- Caveat: 'LME/MCO discretion plays a significant role in budget exception decisions' (the policy says medically necessary services 'will be authorized, regardless of the base budget')
- Caveat: the distinction is 'legally significant but practically ambiguous' (an opinion with no corpus support)
- Caveat: the process 'is not clearly defined in a single policy section' (a judgment about the document, not something a section states)

**Sources.**

- Clinical Coverage Policy 8P, North Carolina Innovations: Category Assignment and Individual Budget Changes, Attachment F, Components of the Individual Budgeting Tool, c.

## q-026

**Question.** Is chiropractic care covered under Policy 5B (Orthotics and Prosthetics)?

**Original key.** No. Policy 5B (Orthotics and Prosthetics) governs devices, not chiropractic services. Per the policy's description/scope section 2.1.1, the policy's scope is orthotic and prosthetic devices that meet medical-necessity criteria; chiropractic services are outside that scope and are not addressed by the not-covered section 4.1 exclusions because they never fall within the policy's coverage at all. Chiropractic coverage, when it exists, is governed by a different clinical coverage policy.

**Proposed key.** No. Policy 5B (Orthotics and Prosthetics) governs devices, not chiropractic services. Per the policy's description in section 1.0 and its specific coverage criteria in section 3.2.1, what the policy covers is orthotic and prosthetic devices that are ordered by a physician, physician assistant, or nurse practitioner and are medically necessary. The policy does not mention chiropractic care at all: section 4.2.1 lists only devices and supplies that are not covered and does not name chiropractic services, so they are not a listed exclusion but simply fall outside what the policy addresses. Chiropractic coverage is governed by a different clinical coverage policy, 1F (Chiropractic Services).

**Caveats, original.** Answer frames scope + not-covered pair; agent should cite both 2.1.1 and 4.1 per cite_scope_and_not_covered determinism hint

**Caveats, proposed.** Policy 5B is silent on chiropractic care; the answer rests on the policy's own scope (sections 1.0 and 3.2.1) and its specific not-covered list (section 4.2.1), not on a stated chiropractic exclusion

**What the original got wrong or could not support.**

- Section 2.1.1 is the policy's 'description/scope section' and states that the scope is orthotic and prosthetic devices (2.1.1 is generic eligibility text about enrollment in NC Medicaid; the description is in 1.0)
- Section 4.1 anchors the negative answer (4.1 is the generic not-covered rule and says nothing about devices or chiropractic services)
- Caveat instructing a citation of 2.1.1 and 4.1 (those sections do not support the answer)

**Sources.**

- Clinical Coverage Policy 5B, Orthotics & Prosthetics: 1.0, 3.2.1, 4.2.1
- Clinical Coverage Policy 1F, Chiropractic Services: 3.2.1

## q-027

**Question.** Does Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity) cover bariatric / body-contouring surgery performed purely for cosmetic weight-loss reasons?

**Original key.** No. Policy 1A-15 covers surgery for clinically severe or morbid obesity only when the beneficiary meets the policy's documented clinical criteria (BMI thresholds, failure of conservative management, medical necessity). Procedures performed solely for cosmetic weight-loss or body-contouring purposes — without meeting the clinical-severity criteria in section 2.1.1 — are not covered; section 4.1 confirms cosmetic procedures are a general exclusion.

**Proposed key.** No. Policy 1A-15 covers a bariatric surgical procedure for clinically severe or morbid obesity only when health records show the beneficiary has met all the clinical criteria in section 3.2.1, which include a diagnosis of morbid obesity, or clinically severe obesity with a listed co-morbid condition, and demonstrated attempts to lose weight through non-surgical means. Section 4.2.1 lists what is not covered: it includes bariatric surgical procedures for a beneficiary with a BMI less than 35 kg/m2 and, under the heading "Cosmetic surgery", surgical removal of the skin and fat folds that can follow bariatric weight loss when done for solely cosmetic purposes.

**What the original got wrong or could not support.**

- 'the clinical-severity criteria in section 2.1.1' (2.1.1 is generic eligibility text with no clinical criteria; the criteria are in 3.2.1)
- 'section 4.1 confirms cosmetic procedures are a general exclusion' (4.1 does not mention cosmetic procedures; the cosmetic exclusion is in 4.2.1 and is limited to surgical removal of skin and fat after bariatric weight loss for solely cosmetic purposes)
- 'medical necessity' listed as one of this policy's documented clinical criteria (it is the generic 3.1 rule, not a criterion in 3.2.1)

**Sources.**

- Clinical Coverage Policy 1A-15, Surgery for Clinically Severe or Morbid Obesity: 3.2.1, 4.2.1, a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]

## q-028

**Question.** Is acupuncture a covered service under Clinical Coverage Policy 8C (Outpatient Behavioral Health)?

**Original key.** No. Policy 8C governs outpatient behavioral health services (section 2.1.1 scope). Acupuncture is not a behavioral health service and falls outside 8C's scope; section 4.1 confirms acupuncture is not among the covered behavioral health modalities. Any acupuncture coverage would be governed by a different clinical policy, not 8C.

**Proposed key.** No. Policy 8C governs outpatient behavioral health services, which section 1.0 describes as psychiatric and comprehensive clinical assessment, medication management, individual, group, and family therapies, psychotherapy for crisis, and psychological testing. Acupuncture is not among those services, and Policy 8C does not mention acupuncture at all. Policy 8C does not say whether acupuncture is covered under any other policy.

**Caveats, original.** EPSDT may permit broader coverage for beneficiaries under 21 when medically necessary

**Caveats, proposed.** For beneficiaries under 21, the policy's EPSDT provision requires coverage of a service that is medically necessary health care to correct or ameliorate a condition, but does not require any service that is unsafe, ineffective, experimental or investigational, not medical in nature, or not generally recognized as an accepted method of medical practice or treatment

**What the original got wrong or could not support.**

- Section 2.1.1 is Policy 8C's scope (2.1.1 is generic eligibility text about enrollment in NC Medicaid; the description is in 1.0)
- Section 4.1 confirms acupuncture is not among the covered behavioral health modalities (4.1 is the generic not-covered rule and mentions neither acupuncture nor behavioral health modalities)
- Any acupuncture coverage would be governed by a different clinical policy (Policy 8C does not say this)
- The EPSDT caveat had no cited section or quote, and as worded it left out the provision's own carve-out

**Sources.**

- Clinical Coverage Policy 8C, Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers: 1.0, a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]

## q-029

**Question.** Does Policy 10A cover routine massage therapy for beneficiaries over age 21?

**Original key.** No. Routine massage therapy is not covered under Policy 10A (Outpatient Therapy) for beneficiaries age 21 and older. The policy's scope section defines covered outpatient therapy services, and routine massage falls outside that scope. EPSDT may permit coverage for beneficiaries under 21 when medically necessary.

**Proposed key.** Policy 10A (Outpatient Specialized Therapies) does not mention massage therapy. It covers medically necessary skilled healthcare provided by a qualified therapist in physical therapy, occupational therapy, speech-language pathology and audiology therapy, so routine massage that is not such therapy is not covered under Policy 10A for a beneficiary over 21. EPSDT may permit coverage for beneficiaries under 21 when medically necessary.

**Caveats, original.** EPSDT exception may apply under 21; NEEDS_VALIDATION

**Caveats, proposed.** EPSDT exception may apply under 21

**What the original got wrong or could not support.**

- Routine massage therapy is not covered under Policy 10A, stated as a flat rule (the policy never mentions massage; no section states a massage exclusion)
- The policy's 'scope section' 2.1.1 defines covered outpatient therapy services (2.1.1 is generic eligibility text; the description is in 1.0)
- Section 4.1 as the basis for the exclusion (4.1 is the generic not-covered rule and says nothing about massage)
- Policy title 'Outpatient Therapy' (the document is 'Outpatient Specialized Therapies')

**Sources.**

- Clinical Coverage Policy 10A, Outpatient Specialized Therapies: 1.0, 3.2.1.1, 2.2.1

## q-030

**Question.** Are experimental or investigational drugs covered under the NC Medicaid outpatient pharmacy benefit?

**Original key.** No. Experimental and investigational drugs — including those not approved by the FDA for the indication being treated — are excluded from the NC Medicaid outpatient pharmacy benefit. The governing pharmacy policy lists experimental treatments among general exclusions.

**Proposed key.** No. Experimental and investigational drugs are excluded from the NC Medicaid outpatient pharmacy benefit. The governing pharmacy policy (Clinical Coverage Policy 9) lists a product that is experimental, investigational, or part of a clinical trial among its general not-covered criteria (section 4.1).

**Caveats, original.** FDA-approved drugs may still require prior authorization; NEEDS_VALIDATION

**Caveats, proposed.** FDA-approved drugs may still require prior authorization

**What the original got wrong or could not support.**

- Experimental and investigational drugs include 'those not approved by the FDA for the indication being treated' (not in section 4.1; section 3.2.1 instead requires an FDA approved indication or a medically accepted indication unless approval is given by DHB, and section 3.2.3 has a request process for use outside FDA approved guidelines, so the policy does not equate the two)
- The prior-authorization caveat had no cited section or quote

**Sources.**

- Clinical Coverage Policy 9, Outpatient Pharmacy Program: 4.1, 5.1

## q-031

**Question.** Does Policy 1A-2 (Preventive Medicine Annual Health Assessment) cover gym memberships or wellness club fees as part of preventive care?

**Original key.** No. Policy 1A-2 covers the clinician-performed annual health assessment (scope section 2.1.1), not lifestyle or fitness memberships. Gym memberships and general wellness-club fees are not a covered Medicaid benefit under Policy 1A-2 and are confirmed as not-covered in section 4.1.

**Proposed key.** No. Policy 1A-2 covers the adult annual health assessment (described in section 1.0), not lifestyle or fitness memberships. The policy does not mention gym memberships or wellness-club fees; its own not-covered criteria (section 4.2.2) concern only when the assessment itself is not covered. Gym memberships and general wellness-club fees are therefore not a covered benefit under Policy 1A-2.

**What the original got wrong or could not support.**

- Section 2.1.1 is the policy's scope section (it is generic eligibility text; the description is in 1.0)
- Gym memberships and wellness-club fees are 'confirmed as not-covered in section 4.1' (4.1 is the generic not-covered rule and does not mention them; no section of the policy does)
- The assessment is 'clinician-performed' (the word does not appear in the policy)

**Sources.**

- Clinical Coverage Policy 1A-2, Preventive Medicine Annual Health Assessment: 1.0, 4.2.2, 3.2.2

## q-032

**Question.** Does Policy 9 (Outpatient Pharmacy) cover over-the-counter fertility or hormone supplements purchased without a prescription?

**Original key.** No. Policy 9's pharmacy benefit scope (section 2.1.1) requires a prescription from an enrolled prescriber and limits OTC coverage to drugs on the state's approved OTC list. Self-purchased OTC fertility or hormone supplements without a prescription are not reimbursable under the pharmacy benefit, and section 4.1 confirms non-prescription retail items are not covered.

**Proposed key.** No. Policy 9 applies to covered legend drugs and covered OTC products dispensed by outpatient pharmacy providers (section 1.0). Its specific coverage criteria (section 3.2.1) cover prescribed drugs, and cover selected OTC products when they meet the criteria in Clinical Coverage Policy 9A, Over-The-Counter Products. Section 4.2.1 lists OTC products (other than those selected under section 3.2.1) and fertility drugs among the items Medicaid shall not cover. Policy 9 itself therefore gives no coverage for OTC fertility or hormone supplements purchased without a prescription.

**Caveats, original.** A small number of OTCs (e.g., prenatal vitamins) are covered when prescribed

**Caveats, proposed.** Selected OTC products, including insulin, are covered when they meet the criteria in Policy 9A; prenatal vitamins and fluoride are also on Policy 9's covered list

**What the original got wrong or could not support.**

- Section 2.1.1 is Policy 9's pharmacy benefit scope and requires a prescription and sets OTC list rules (2.1.1 is generic eligibility text; the description is in 1.0 and the criteria in 3.2.1)
- A prescription 'from an enrolled prescriber' is required (no such wording in the policy's coverage criteria)
- OTC coverage is limited to 'drugs on the state's approved OTC list' (Policy 9 says only that selected OTC products are covered when they meet the criteria in Policy 9A)
- Section 4.1 confirms non-prescription retail items are not covered (4.1 is the generic not-covered rule and says nothing about prescriptions, OTC or retail items; the OTC and fertility exclusions are in 4.2.1)
- Prenatal vitamins as an example of a covered OTC (section 3.2.1 lists prenatal vitamins and fluoride as covered but does not describe them as OTC; the OTC example it gives is insulin)

**Sources.**

- Clinical Coverage Policy 9, Outpatient Pharmacy Program: 1.0, 3.2.1, 4.2.1

## q-033 (read first)

**Question.** If NC Medicaid denies prior authorization for a service, can the beneficiary appeal directly to CMS?

**Original key.** No. Medicaid prior-authorization denials are appealed through the state administrative process, not directly to CMS. The beneficiary must first request reconsideration or a state fair hearing under NC's procedures; CMS is the federal oversight agency for state Medicaid programs but does not adjudicate individual beneficiary appeals. If the answer gives a time limit for requesting the hearing, it must either give a North Carolina limit taken from a North Carolina source for that kind of decision, or present the federal figure (42 CFR 431.221(d): a reasonable time, not to exceed 90 days from the date the notice of action is mailed) explicitly as the federal maximum and tell the person to check the deadline printed on their notice, which may be shorter than the federal bound, and to confirm it promptly with the agency that sent it or with legal aid. An answer that gives 90 days as the North Carolina deadline, or as the only time limit under a North Carolina heading without that qualification, is incorrect.

**Proposed key.** No. Medicaid prior-authorization denials are appealed through the state administrative process, not directly to CMS. Federal rules require the State agency to grant a hearing on a prior authorization decision (42 CFR 431.220), and in North Carolina the Office of Administrative Hearings makes the final decision when NC Medicaid or one of its contractors denies a service; a plan member must first appeal to the plan and may request a State Fair Hearing if it upholds the denial or misses its notice and timing requirements. If the answer gives a time limit for requesting the hearing, it must either give a North Carolina limit taken from a North Carolina source for that kind of decision (for a plan denial, North Carolina's plan contracts allow 120 calendar days from the plan's Notice of Resolution), or present the federal figure (State agency denial, 42 CFR 431.221(d): a reasonable time, not to exceed 90 days from mailing of the notice of action; plan denial, 42 CFR 438.408(f)(2): 90 to 120 calendar days from the plan's notice of resolution) explicitly as the federal bound and tell the person to check the deadline printed on their notice, which for a State agency denial may be shorter than the federal maximum, and to confirm it promptly with the agency or plan that sent it or with legal aid. An answer that gives 90 days as the North Carolina deadline, or as the only time limit under a North Carolina heading without that qualification, is incorrect.

**Caveats, original.** Federal oversight applies to state program compliance, not to individual PA denials; A federal maximum is not the North Carolina deadline; the deadline printed on the notice may be shorter and should be confirmed promptly; A North Carolina time limit must come from a North Carolina source

**Caveats, proposed.** Federal rules make the single State agency responsible for fair hearings under 42 CFR Part 431 Subpart E; A federal maximum is not by itself the North Carolina deadline; for a State agency denial the deadline printed on the notice may be shorter and should be confirmed promptly; A North Carolina time limit must come from a North Carolina source

**What the original got wrong or could not support.**

- 'must first request reconsideration': no located section gives a beneficiary a 'reconsideration' step for a prior authorization denial; the first step the corpus does describe is an appeal to the plan, for members of an NC Medicaid Managed Care plan only.
- 'CMS is the federal oversight agency for state Medicaid programs but does not adjudicate individual beneficiary appeals': not stated in the corpus; the regulation states the positive rule that the State agency grants the hearing.
- Caveat 'Federal oversight applies to state program compliance, not to individual PA denials': not stated in the corpus.
- 42 CFR 431.221(d) was relied on in the answer text but 431.221 was not among the cited sections.
- The 90-day figure was presented as the federal maximum for every prior authorization denial; for a denial by a managed care plan the federal window is 42 CFR 438.408(f)(2), 90 to 120 calendar days from the plan's notice of resolution, and the North Carolina plan contracts set 120 calendar days.

**Sources.**

- 42 CFR Part 431: 431.220, 431.221, 431.10, 431.205
- 42 CFR Part 438: 438.408
- 2023 NC Medicaid Managed Care Quality Strategy: Member Appeals
- State Plan under Title XIX of the Social Security Act Medical Assistance Program: Medicaid Administration
- Contract #30-190029 Prepaid Health Plan Services Amendment 13/14: g. Section  V.B.  Members,  6.  Member  Grievance  and  Appeals,  f.  State  Fair  Hearing  Process  is revised and restated as follows:
- Contract #30-2020-052 Behavioral Health and I/DD Tailored Plan Amendment 1: iv. Marketing
- Medicaid Direct Prepaid Inpatient Health Plan Contract: x. Extension of Standard Resolution of Appeal
- Contract #30-2024-001-DHB-Children and Families Specialty Plan Section V: 8) Request for Plan Appeals
- MA-2905- MEDICAID COVERED SERVICES: H. Medicaid Recipient Due Process Rights
- Community Alternatives Program for Disabled Adults Approved Waiver: Appendix F-1: Opportunity to Request a Fair Hearing

## q-034

**Question.** Does the NC Medicaid dental benefit cover cosmetic teeth whitening for adults?

**Original key.** No. Cosmetic teeth whitening is not a covered service under the NC Medicaid adult dental benefit. The benefit covers medically necessary dental care (e.g., extractions, restorations, oral surgery under defined criteria); purely cosmetic procedures are excluded.

**Proposed key.** No. Cosmetic teeth whitening is not a covered service under the NC Medicaid dental benefit for adults. Clinical Coverage Policy 4A (Dental Services) states that Medicaid shall not cover cosmetic procedures, and that only the procedure codes listed in the policy are covered. The benefit covers medically necessary dental care (e.g., extractions and restorations, within the policy's limitations); purely cosmetic procedures are excluded, and the policy also says resin-based composite restorations are not covered for treatment of cosmetic problems such as discolored teeth.

**What the original got wrong or could not support.**

- Nothing the original cited (generic section 4.1) mentions cosmetic procedures, whitening or what the dental benefit covers; the conclusion is right but was attributed to the wrong section.

**Sources.**

- Clinical Coverage Policy 4A, Dental Services: 4.2.1, 1.0, 5.3.4.2, 3.1, 5.3.11.1, 5.3.4

## q-035

**Question.** Under Policy 5A-2 (Respiratory Equipment and Supplies), can an adult beneficiary get a replacement CPAP machine every year?

**Original key.** No. Policy 5A-2 sets coverage criteria (section 3.2.1) that include frequency-of-replacement limits for durable respiratory equipment. Annual replacement is not a benefit; replacement is authorized only after a defined minimum useful-life interval or when medically necessary due to documented device failure not repairable under warranty. Section 4.2.1 lists specific items and conditions that are not covered when the frequency or medical-necessity requirement is not met.

**Proposed key.** No. Annual replacement of a CPAP machine is not a benefit under Policy 5A-2. Attachment A, Section C of the policy lists a lifetime expectancy of 5 years for the CPAP device (HCPCS E0601). Under section 5.9, Medicaid may consider replacing an item when repairing it is no longer cost-effective and the item is out of warranty, and a prior approval request to replace an item before its usual life expectancy has ended must explain on the CMN/PA form why the replacement is needed. Under section 5.5, equipment ordered beyond the policy's limits needs prior approval, and a request to override a lifetime expectancy must include an explanation of the medical necessity for the override.

**What the original got wrong or could not support.**

- Section 3.2.1 includes frequency-of-replacement limits: it does not; it covers ordering, medical necessity, the face-to-face encounter and annual review of need.
- Section 4.2.1 lists items not covered when the frequency requirement is not met: it does not; it lists convenience items, backups and duplicates, inpatient settings, items covered by another agency and hospice diagnoses.
- Replacement only for 'documented device failure not repairable under warranty': the policy's wording is that Medicaid may consider replacement when repairing is no longer cost-effective and the item is out of warranty.
- The original gave no figure; the policy's figure for the CPAP device is a 5-year lifetime expectancy.

**Sources.**

- Clinical Coverage Policy 5A-2, Respiratory Equipment and Supplies: Lifetime Expectancies and Quantity Limitations for Durable Medical Equipment and Supplies, 5.9, 5.5, 2.2.1

## q-036

**Question.** Does Policy 1-H authorize routine general-wellness telehealth visits without a specific clinical indication?

**Original key.** No. Policy 1-H governs telehealth as a modality for delivering specific covered clinical services; it does not authorize routine general-wellness visits via telehealth absent a clinical indication. The covered service must itself be a Medicaid-covered benefit, and the telehealth modality must meet the policy's technical and clinical requirements.

**Proposed key.** No. Policy 1-H gives overarching guidance on delivering services via telehealth; its coverage sections do not mention general-wellness visits, so nothing in it authorizes a routine wellness visit via telehealth without a clinical indication. The service must be one eligible for telehealth under Attachment A of the policy or a related coverage policy, must be medically necessary under the general rule in section 3.1, and must meet the policy's telehealth requirements, such as secure HIPAA-compliant live audio and video.

**Caveats, original.** Coverage depends on the underlying service being a benefit; general wellness is typically not a standalone benefit; NEEDS_VALIDATION

**Caveats, proposed.** Coverage depends on the underlying service being eligible for telehealth under Attachment A of Policy 1-H or a related program-specific coverage policy

**What the original got wrong or could not support.**

- Caveat 'general wellness is typically not a standalone benefit': nothing in Policy 1-H says this.
- The cited section 2.1.1 is generic eligibility text and says nothing about telehealth, wellness visits or clinical indications.
- 'does not authorize routine general-wellness visits ... absent a clinical indication' is not stated anywhere in 1-H in those terms; the policy is silent on general-wellness visits (4.2.1 reads 'None Apply'), so the point can rest only on the list of eligible services and the general medical-necessity rule in 3.1.

**Sources.**

- Clinical Coverage Policy 1H, Telehealth, Virtual Communications and Remote Patient Monitoring: Description of the Procedure, Product, or Service, Telehealth, Virtual Communications, and Remote Patient Monitoring Services Covered in Clinical Coverage Policy 1-H, 3.1, 3.4, 5.3.1

## q-037

**Question.** Does NEMT (Non-Emergency Medical Transportation) cover transportation to non-medical errands such as grocery shopping?

**Original key.** No. NEMT under MA-3550 covers transportation to and from medically necessary covered Medicaid services only. Transportation for non-medical purposes — groceries, personal errands, social visits — is not a covered NEMT service.

**Proposed key.** No. NEMT under MA-3550 is only provided for Medicaid covered services and when the primary reason for the trip is medical care. Transportation for non-medical purposes — groceries, personal errands, social visits — is not a covered NEMT service.

**Caveats, original.** County Departments of Social Services administer NEMT; eligibility and ride authorization are locally managed

**Caveats, proposed.** County Departments of Social Services administer NEMT; ride authorization is locally managed

**What the original got wrong or could not support.**

- 'medically necessary covered Medicaid services': the manual's test is a Medicaid covered service with medical care as the primary reason for the trip; it uses 'medically necessary' only for ambulance transport.
- Caveat 'eligibility ... locally managed': the manual says only that the transportation coordinator verifies Medicaid eligibility at each trip request.
- The cited section _s2 is an empty heading and supports nothing.

**Sources.**

- MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT): A. Medicaid Covered Services, XV. DEFINITIONS, D. Which Local Agency is Responsible?

## q-038

**Question.** Does the CAP/DA waiver cover a beneficiary's room and board in their own home?

**Original key.** No. CAP/DA is a home- and community-based services (HCBS) waiver; by federal design it cannot pay for a beneficiary's room and board in their own home. The waiver funds in-home services (personal care, case management, assistive technology, etc.) that support community living, but rent, utilities, and groceries are explicitly excluded.

**Proposed key.** No. CAP/DA is a Medicaid Home and Community-Based Services (HCBS) waiver, and under 42 CFR 441.310 federal funding for HCBS waiver services is not available for the cost of room and board, apart from narrow exceptions. Policy 3K-2 says community transition and community integration services do not cover room and board, and community integration services do not include monthly rental or mortgage expense, food, or regular utility charges. The waiver funds services such as in-home aide, personal assistance and case management that allow a beneficiary to remain in or return to a home and community-based setting.

**Caveats, original.** Federal 1915(c) waiver rules prohibit paying for room and board except in very narrow respite situations

**Caveats, proposed.** 42 CFR 441.310 excepts room and board provided as part of respite care in a State-approved facility that is not a private residence, and a portion of rent and food attributable to an unrelated live-in caregiver; Community transition services, for a beneficiary moving from an institution to the community, may cover set-up costs such as a security deposit or first month's rent required to obtain a lease and utility set-up fees or deposits, but not rent or back rent

**What the original got wrong or could not support.**

- 'rent, utilities, and groceries are explicitly excluded' as a waiver-wide rule: Policy 3K-2 has no general room-and-board exclusion; it excludes room and board within specific services, and it does not use the word 'groceries'
- 'personal care' and 'assistive technology' as waiver service names: the policy lists 'CAP In-home aide I & II', 'Personal assistance' and 'Equipment, modification and technology'
- Caveat 'except in very narrow respite situations': 42 CFR 441.310(a)(2) has a second exception for rent and food attributable to an unrelated live-in caregiver
- Section 4.1 as the source: it is generic template text and says nothing about room and board

**Sources.**

- Clinical Coverage Policy 3K-2, Community Alternatives Program for Disabled Adults (CAP/DA): 5.8.6, Limits, Amount And Frequency, 1.0, The CAP/DA waiver services are:, COMMUNITY TRANSITION SERVICES
- 42 CFR Part 441: 441.310

## q-039

**Question.** Is private-duty nursing covered under NC Medicaid Policy 3G-1 for adult beneficiaries who do not meet medical-complexity criteria?

**Original key.** No. Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older) restricts PDN to beneficiaries meeting the medical-complexity and continuous-skilled-nursing criteria in section 3.2.1. Adult beneficiaries who do not meet those criteria are not eligible for PDN; their care needs are addressed through lower-intensity benefits such as personal care services under a different policy.

**Proposed key.** No. Under section 3.2.2 of Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older), Medicaid covers PDN when the health criteria in Section 3.3 are met, along with the other conditions listed there. Section 3.3.1 sets the Level 1 health criteria, which begin with dependence on a ventilator for at least eight hours per day or meeting at least four listed criteria. Adult beneficiaries who do not meet those criteria are not eligible for PDN under this policy.

**Caveats, original.** Policy 3G-2 governs PDN for beneficiaries under 21 and has different criteria (EPSDT)

**Caveats, proposed.** Policy 3G-1 lists 3G-2, Private Duty Nursing for Beneficiaries under 21 Years of Age, as a related policy; the portions of 3G-1 pertaining to beneficiaries under 21 were removed

**What the original got wrong or could not support.**

- 'criteria in section 3.2.1': section 3.2.1 of Policy 3G-1 reads 'None Apply.'; the criteria are in sections 3.2.2 and 3.3.1
- 'medical-complexity criteria' as a named test: the policy has no criteria by that name; it defines 'Complex' in 1.1.4 and sets health criteria in 3.3
- 'their care needs are addressed through lower-intensity benefits such as personal care services under a different policy': Policy 3G-1 does not mention personal care services or say where such beneficiaries are served
- Caveat 'has different criteria (EPSDT)': 3G-1 only names 3G-2 as a related policy and does not describe its criteria

**Sources.**

- Clinical Coverage Policy 3G-1, Private Duty Nursing for Beneficiaries Age 21 and Older: 3.2.2, 3.3.1, Related Clinical Coverage Policies, Information:

## q-040

**Question.** Does NC Medicaid cover over-the-counter medications without a prescription?

**Original key.** No — not as a general rule. NC Medicaid's outpatient pharmacy benefit covers prescribed drugs, including selected OTC drugs, only when a prescription is written by an enrolled prescriber and the drug is on the state's approved OTC list. Self-purchased OTC items without a prescription are not reimbursable.

**Proposed key.** No — not as a general rule. NC Medicaid's outpatient pharmacy benefit (Clinical Coverage Policy 9) covers prescribed drugs and lists OTC products among the items Medicaid shall not cover, except that selected OTC products, including insulin, are covered when they meet the criteria in clinical coverage policy 9A, Over-The-Counter Products. Policy 9 itself gives no coverage for OTC items obtained without a prescription.

**Caveats, original.** Some OTCs (e.g., prenatal vitamins, certain contraceptives) are covered with a prescription; NEEDS_VALIDATION

**Caveats, proposed.** Selected OTC products (e.g., insulin) are covered when they meet the Policy 9A criteria; Policy 9 separately lists prenatal vitamins and fluoride as covered

**What the original got wrong or could not support.**

- 'only when a prescription is written by an enrolled prescriber': Policy 9 section 3.2.1 covers 'prescribed drugs' and says nothing about the prescriber being enrolled
- 'the drug is on the state's approved OTC list': Policy 9 says only that selected OTC products are covered when they meet the criteria in Policy 9A
- 'Self-purchased ... not reimbursable': Policy 9 does not speak of self-purchase or reimbursement to beneficiaries; section 4.2.1 says OTC products are not covered, subject to 3.2.1
- Caveat naming prenatal vitamins and 'certain contraceptives' as OTCs covered with a prescription: section 3.2.1 lists 'Prenatal vitamins and fluoride' as covered without calling them OTC, and Policy 9 names no OTC contraceptive

**Sources.**

- Clinical Coverage Policy 9, Outpatient Pharmacy Program: 3.2.1, 4.2.1

## q-041

**Question.** What is the current governing federal regulation for grants administration applied to Medicaid — 45 CFR Part 74 or 45 CFR Part 75?

**Original key.** Neither is currently in force. 45 CFR Part 74 was superseded by 45 CFR Part 75 in December 2014 when HHS adopted the OMB Uniform Guidance, and in late 2025 HHS rescinded Part 75 as well — both 45 CFR Parts 74 and 75 are now [Reserved] in the current eCFR. The governing authority for Medicaid grants administration today is 2 CFR Part 200 (Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards), which Medicaid cross-references via 42 CFR § 430.30(e). The pipeline's CFR supersession resolver remaps both 45 CFR 74 and 45 CFR 75 citations to 2 CFR Part 200.

**Proposed key.** Neither is what 42 CFR § 430.30(e) names. The governing authority for Medicaid grants administration is 2 CFR Part 200 (Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards), together with 2 CFR part 300, which Medicaid cross-references via 42 CFR § 430.30(e). That paragraph says the provisions of 2 CFR parts 200 and 300, which establish uniform administrative requirements and cost principles, apply to all grants made to States under the subpart, with exceptions for cost sharing or matching (2 CFR 200.306) and financial reporting (2 CFR 200.328). The local corpus does not hold the text of 45 CFR Part 74 or Part 75, so an answer should not state when or whether those parts were superseded or rescinded.

**Caveats, original.** NC Medicaid documents that predate late-2025 still cite 45 CFR Part 75; treat those as references to 2 CFR Part 200.

**Caveats, proposed.** Some documents in the corpus cite 45 CFR Part 74 or Part 75: 42 CFR § 433.110 refers to 45 CFR part 75, an NC state plan page cites 45 CFR 75.326 for procurement, and an NC managed care contract cites 45 C.F.R. § 74.53 for record retention.

**What the original got wrong or could not support.**

- '45 CFR Part 74 was superseded by 45 CFR Part 75 in December 2014 when HHS adopted the OMB Uniform Guidance': not in the corpus; 45 CFR Parts 74 and 75 are not indexed
- 'in late 2025 HHS rescinded Part 75 as well — both 45 CFR Parts 74 and 75 are now [Reserved] in the current eCFR': not in the corpus
- 'Neither is currently in force': no section states the status of either part
- 'The pipeline's CFR supersession resolver remaps both 45 CFR 74 and 45 CFR 75 citations to 2 CFR Part 200': a claim about software, not stated in any corpus section
- Caveat 'documents that predate late-2025' and 'treat those as references to 2 CFR Part 200': no section gives that date or that instruction
- 2 CFR § 200.104 as support: it speaks only of earlier OMB guidance under Title 2 and OMB circulars, not of 45 CFR Parts 74 or 75

**Sources.**

- 42 CFR Part 430: 430.30, 430.2
- 2 CFR Part 200: 200.100
- 42 CFR Part 433: 433.110
- 21-0011 PCCMe Tribal Option.pdf: 42 CFR 438.50(b)(4) C. Public Process.
- Contract--30-190029-DHB-Prepaid-Health-Plan-Services RFP: 33. PERFORMANCE BOND:

## q-043

**Question.** When was the most recent change notice issued for Clinical Coverage Policy 8C (Outpatient Behavioral Health)?

**Original key.** The most recent revision to Clinical Coverage Policy 8C has an effective date of April 15, 2025 (amending Section 3.2.2), as recorded in the policy's own revision-information table. The agent should pull amendments for doc:clinical_policy:8C via getAmendments, identify the latest effective date, and cite both Policy 8C and the revision. Acceptable variants: any specific revision date returned by getAmendments that is consistent with the revision-information section of the current Policy 8C PDF.

**Proposed key.** The latest row in the Revision Information table of Clinical Coverage Policy 8C is dated 04/15/2025 and revises Section 3.2.2, correcting missed language complying with the Mental Health Parity and Addiction Equity Act. The same row says "Policy posted 4/15/25 amendment date not changed"; the policy header shows an Amended Date of January 1, 2025, and the rows immediately before the last one are dated 01/01/2025.

**What the original got wrong or could not support.**

- 'has an effective date of April 15, 2025': the table does not call 04/15/2025 an effective date; the row says 'Policy posted 4/15/25 amendment date not changed'
- evidence note that section 1.0 is the 'Base policy 8C header (effective date)': section 1.0 contains no date

**Sources.**

- Clinical Coverage Policy 8C, Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers: Revision Information:, NC Medicaid Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers

## q-044

**Question.** Has the CAP/DA waiver policy been amended since 2024?

**Original key.** (none: the key held only instructions to the assistant, now in `expected_behavior`)

**Proposed key.** Yes. The copy of Clinical Coverage Policy 3K-2 (CAP/DA) in the corpus carries an Amended Date of September 1, 2025, and its Revision Information table has entries dated 11/15/2024 and 09/01/2025. The 11/15/2024 entries state that CMS approved an amended CAP/DA waiver application and that all sections in the policy were updated to align with it. The 09/01/2025 entries, the latest in the table, state that CMS approved the CAP/DA renewal waiver, effective 11/1/2024, and that sections were revised to align with it. The entries immediately before these are dated 07/01/2021.

**Caveats, original.** Exact answer depends on live graph state — NEEDS_VALIDATION

**Caveats, proposed.** Answer reflects the copy of Policy 3K-2 in the corpus (Amended Date September 1, 2025)

**Sources.**

- Clinical Coverage Policy 3K-2, Community Alternatives Program for Disabled Adults (CAP/DA): Revision Information:, _s0

## q-045

**Question.** What is the most recent revision to 42 CFR Part 441 as it applies to HCBS waiver applications?

**Original key.** The latest revision is the one reflected in the eCFR snapshot currently ingested into the corpus.

**Proposed key.** In the corpus copy of 42 CFR Part 441, the section 1915(c) waiver-request sections each end with a note (labelled Authority) listing Federal Register citations, and the most recent amendment listed for each is dated May 10, 2024: § 441.301 (contents of the request) at 89 FR 40863, § 441.302 (State assurances) at 89 FR 40865, and § 441.303 (supporting documentation) at 89 FR 40866. In the separate provisions for section 1915(d) waivers serving individuals age 65 or older, § 441.353 (supporting documentation) lists a later amendment, 89 FR 80069, Oct. 2, 2024.

**Caveats, original.** NEEDS_VALIDATION: fill actual eCFR ingestion date

**Caveats, proposed.** The corpus text does not state the date of the eCFR snapshot that was ingested, and the notes give only Federal Register citations and dates: they do not describe what each amendment changed.

**What the original got wrong or could not support.**

- 'The latest revision is the one reflected in the eCFR snapshot currently ingested into the corpus': names no revision or date, and no section text states a snapshot or ingestion date
- the evidence note calling §§ 441.351 onward a 'parallel newer numbering family': § 441.350 shows it is a different subpart, for section 1915(d) waivers serving individuals age 65 or older

**Sources.**

- 42 CFR Part 441: 441.301, 441.302, 441.303, 441.300, 441.350, 441.353

## q-046

**Question.** What federal regulation authorizes NC Medicaid's 1915(c) HCBS waivers such as CAP/DA?

**Original key.** Section 1915(c) of the Social Security Act (42 USC § 1396n(c)) provides the statutory authority for HCBS waivers. The implementing regulations are in 42 CFR Part 441 Subpart G — specifically § 441.301 (state plan requirements), § 441.302 (assurances), and § 441.303 (supporting documentation). CAP/DA is North Carolina's 1915(c) waiver implementing those requirements for disabled adults.

**Proposed key.** Section 1915(c) of the Social Security Act provides the statutory authority for HCBS waivers. The implementing regulations are in 42 CFR Part 441 — specifically § 441.301 (contents of the request for a waiver), § 441.302 (State assurances), and § 441.303 (supporting documentation). CAP/DA is North Carolina's HCBS waiver authorized under section 1915(c) for adults with disabilities; its clinical coverage policy states that federal regulations for HCBS waivers are found in 42 CFR Part 441 Subpart G.

**What the original got wrong or could not support.**

- '§ 441.301 (state plan requirements)': contradicted; § 441.301 is 'Contents of request for a waiver' and lists what a waiver request must consist of
- '42 USC § 1396n(c)': not in the corpus (federal statute text is not ingested; the regulation and policy refer only to section 1915(c) of the Act)
- 'Subpart G' as the label of §§ 441.301-441.303: the Part 441 section text never names its subpart; only policy 3K-2 section 1.0 uses the label
- 'CAP/DA is North Carolina's 1915(c) waiver implementing those requirements for disabled adults': no cited section supported it; the supported wording is in policy 3K-2 section 1.0

**Sources.**

- 42 CFR Part 441: 441.300, 441.301, 441.302, 441.303
- Clinical Coverage Policy 3K-2, Community Alternatives Program for Disabled Adults (CAP/DA): 1.0

## q-047

**Question.** Which federal regulation governs timeliness requirements for state Medicaid plan amendments (SPAs)?

**Original key.** 42 CFR § 430.12 governs the submission and amendment of the state Medicaid plan, including requirements for timely submission of plan amendments to CMS for review and approval. It establishes when states must submit SPAs and the federal review timeline.

**Proposed key.** 42 CFR § 430.12 governs the submittal of the state Medicaid plan and plan amendments. It requires the plan to be amended whenever necessary to reflect, among other things, changes in Federal law or material changes in State law, organization, or policy, and it states that prompt submittal of amendments is necessary so that CMS can determine whether the plan continues to meet the requirements for approval. The federal review timeline is not in § 430.12; it is in 42 CFR § 430.16, under which a plan amendment is considered approved unless CMS, within 90 days after receipt in the regional office, sends the State written notice of disapproval or of additional information it needs.

**What the original got wrong or could not support.**

- § 430.12 establishes the federal review timeline: it does not; the 90-day CMS action period is in § 430.16
- § 430.12 'establishes when states must submit SPAs': it sets no general deadline, only that prompt submittal is necessary, plus a 60-day limit for advance directive changes

**Sources.**

- 42 CFR Part 430: 430.12, 430.16

## q-048

**Question.** What federal rule governs the Medical Loss Ratio (MLR) requirements for Medicaid managed care contracts?

**Original key.** 42 CFR § 438.8 establishes the Medical Loss Ratio requirements for Medicaid and CHIP managed care contracts. It sets the minimum percentage of capitation payments that plans must spend on clinical services and quality-improvement activities (85% minimum for MCOs), and prescribes the methodology for calculating and reporting MLR.

**Proposed key.** 42 CFR § 438.8 establishes the Medical Loss Ratio standards for Medicaid managed care contracts. It requires States to ensure, through their contracts, that each MCO, PIHP, and PAHP calculates and reports an MLR, and prescribes the methodology for calculating and reporting it: the MLR is the ratio of a numerator (incurred claims, expenditures for activities that improve health care quality, and fraud prevention activities) to a denominator of adjusted premium revenue, which includes State capitation payments. The rule sets 85 percent as a floor only if a State elects to mandate a minimum MLR for its MCOs, PIHPs, or PAHPs: in that case the minimum must be equal to or higher than 85 percent.

**What the original got wrong or could not support.**

- That § 438.8 covers CHIP managed care contracts: the section's text never mentions CHIP.
- That § 438.8 sets an unconditional 85% minimum that plans must spend: 438.8(c) applies 85 percent only 'If a State elects to mandate a minimum MLR'.
- That the 85% figure is specific to MCOs: 438.8(c) applies to MCOs, PIHPs, and PAHPs alike.
- The term 'clinical services': the section's numerator is incurred claims, activities that improve health care quality, and fraud prevention activities.

**Sources.**

- 42 CFR Part 438: 438.8

## q-049 (read first)

**Question.** What is the federal authority for Medicaid EPSDT (Early and Periodic Screening, Diagnostic, and Treatment) services?

**Original key.** EPSDT is established by Section 1905(r) of the Social Security Act (42 USC § 1396d(r)) and implemented in 42 CFR Part 441 Subpart B (§§ 441.50–441.62). It requires state Medicaid programs to provide comprehensive preventive, diagnostic, and treatment services for Medicaid-eligible children under 21, including any medically necessary service that could be covered under Medicaid even if that service is not included in the state plan for adults.

**Proposed key.** Federal parity regulations (42 CFR 438.900 and 440.395) define EPSDT benefits as those defined in section 1905(r) of the Social Security Act, which NC clinical coverage policies cite as 42 U.S.C. § 1396d(r). 42 CFR 440.40(b) defines EPSDT and refers to subpart B of Part 441; § 441.50 states that its subpart implements sections 1902(a)(43) and 1905(a)(4)(B) of the Act by prescribing State plan requirements for screening, diagnosis and treatment of beneficiaries under age 21. As NC clinical coverage policies describe 42 U.S.C. § 1396d(r), it requires the state Medicaid agency to cover a service for a beneficiary under 21 if it is medically necessary health care to correct or ameliorate a defect, physical or mental illness, or condition identified through a screening examination. § 441.56(c) requires diagnosis and treatment of vision and hearing defects, dental care and appropriate immunizations, when screening indicates the need, even if not included in the state plan.

**What the original got wrong or could not support.**

- 'Established by' section 1905(r): Social Security Act text is not in the corpus. What the corpus has is federal regulations defining EPSDT benefits as those defined in section 1905(r) (42 CFR 438.900, 440.395) and the NC policies' citation of 42 U.S.C. 1396d(r), so the claim is restated in those terms.
- 'Any medically necessary service that could be covered under Medicaid even if that service is not included in the state plan for adults': no federal section in the corpus says this; 441.56(c) applies 'even if the services are not included in the plan' only to vision and hearing, dental care and immunizations. The medical-necessity mandate appears only in the NC policies' description of the statute.
- The range '§§ 441.50–441.62' is not stated in any section's text (441.55 gives §§ 441.56-441.62), and 441.50 names sections 1902(a)(43) and 1905(a)(4)(B), not 1905(r), as what the subpart implements. The label 'subpart B of part 441' is supported, by 42 CFR 440.40(b).

**Sources.**

- 42 CFR Part 441: 441.50, 441.55, 441.56
- Clinical Coverage Policy 10A, Outpatient Specialized Therapies: 2.2.1
- 42 CFR Part 438: 438.900
- 42 CFR Part 440: 440.40, 440.395

## q-050

**Question.** What federal regulation governs provider enrollment screening requirements for Medicaid?

**Original key.** 42 CFR Part 455 Subpart E (§§ 455.400–455.470) governs Medicaid provider enrollment and screening requirements. It establishes risk-based screening levels (limited, moderate, high), fingerprint-based background checks for high-risk categories, site visits, and revalidation requirements. States must screen all providers at enrollment and re-validate at least every five years.

**Proposed key.** 42 CFR Part 455 Subpart E governs Medicaid provider enrollment and screening requirements. It establishes risk-based screening levels (limited, moderate, high), fingerprint-based background checks for high-risk categories, site visits, and revalidation requirements. States must screen all providers at enrollment and re-validate at least every five years.

**What the original got wrong or could not support.**

- The section range '§§ 455.400–455.470' for Subpart E is not stated in any section's text; the nearest text is 455.405, which names '§ 455.410 through § 455.450 and § 455.470' as State plan requirements, a different range.

**Sources.**

- 42 CFR Part 455: 455.410, 455.450, 455.414, 455.400, 455.432
- 42 CFR Part 438: 438.608
