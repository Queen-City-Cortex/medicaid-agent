# Golden answer keys: review list for dataset 3.3

Forty answer keys were reworded in dataset 3.1 (review EVAL-1b, issue #554). In 3.3, 37 of them are validated and scored; 3 depend on legal judgment and stay unscored.

## How the validated keys were approved

The owner's decision of 2026-10-07: a reworded key is marked validated when a strict, independent read of its final text against the corpus returns no findings. Each key below went through a drafting pass, an independent verification, a revision, and that final read. Every quote is machine-checked to be verbatim in the section named. Nobody with legal training has read them, and the drafting and the checking were done by the same kind of model, so the owner spot-checks a sample.

## How to spot-check

Each key is broken into pairs: what the key says, and the verbatim text it rests on. For each pair, ask one question: **does the text say what the key says?** Look for a key that says more than the text ("must" where the text says "may", "all" where the text lists some, a number the text does not give) or that applies the text to a different service or group of people. Read the proposed key itself as well: a claim in the key with no pair is a defect.

If a pair does not hold, set that key's `status` back to `needs_validation` in `dataset.json` with a `validation_note` saying which pair, and raise the version in `dataset-version.json` with a line in `CHANGELOG.md`.

# Part 1: suggested spot-check sample (6 keys)

Chosen to cover different kinds of question: service criteria, exclusions, a drug therapy, a surgical policy, a waiver, and a federal regulation.
Spot-check record: the owner read q-003 on 2026-10-07 and found it sound. The owner questioned pair 4 of q-038 the same day; the key was narrowed and re-read (see the 3.3 changelog entry), and is shown here as revised.

## q-003

**Question.** What are the entrance, continued service, and discharge criteria for outpatient behavioral health services in NC Medicaid?

**Proposed key.** Clinical Coverage Policy 8C defines outpatient behavioral health service criteria across three phases: Entrance criteria (section 3.2.1.1) must all be met and include a current DSM-5 diagnosis and associated functional impairment. Continued service criteria (section 3.2.1.2) require both an outcome not yet restored, improved or sustained (or relapse risk or tenuous gains) and either achieved goals with additional goals indicated or satisfactory progress with documentation that continued service is expected to be effective. Discharge criteria (section 3.2.1.3) are met when any one applies: functioning has improved with respect to treatment plan goals, the beneficiary or legally responsible person no longer wishes services, or the beneficiary has failed to improve despite treatment plan modifications and requires a more appropriate treatment modality.

**Caveats.** Telephonic services have their own criteria in 3.2.2, referenced from 3.1.2; Psychological testing has additional criteria in 3.2.1.4

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy 8C sets criteria for outpatient behavioral health services
   **Text says:** "Medicaid shall cover outpatient behavioral health services when the beneficiary meets the following criteria:"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1*

2. **Key says:** entrance criteria must all be met
   **Text says:** "All of the following criteria are necessary for admission of a beneficiary to outpatient treatment services"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.1*

3. **Key says:** entrance criteria specify the diagnosis
   **Text says:** "A current Diagnostic and Statistical Manual of Mental Disorders, Fifth Edition [(DSM-5) or any subsequent editions of this reference material] diagnosis"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.1*

4. **Key says:** entrance criteria specify functional impairment
   **Text says:** "The beneficiary presents behavioral, psychological, or biological dysfunction and functional impairment, which are consistent and associated with the current diagnosis"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.1*

5. **Key says:** continued service criteria have two parts that must both be met
   **Text says:** "The criteria for continued service must meet both 'a.' and 'b.' below"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.2*

6. **Key says:** first part: outcome not yet restored, improved or sustained, risk of relapse, or tenuous gains
   **Text says:** "The desired outcome or level of functioning has not been restored, improved, or sustained over the timeframe outlined in the beneficiary's treatment plan; The beneficiary continues to be at risk for relapse based on current clinical assessment, and history: or Tenuous nature of the functional gains."
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.2*

7. **Key says:** second part: goals achieved with additional goals indicated, or satisfactory progress with documentation that continuation is expected to be effective
   **Text says:** "The beneficiary has achieved current treatment plan goals, and additional goals are indicated as evidenced by documented symptoms; or The beneficiary is making satisfactory progress toward meeting goals and there is documentation that supports that continuation of this service is expected to be effective in addressing the goals outlined in the treatment plan."
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.2*

8. **Key says:** discharge: any one criterion; improved functioning; no longer wishes services
   **Text says:** "Any ONE of the following criteria must be met: The beneficiary's level of functioning has improved with respect to the goals outlined in the treatment plan; The beneficiary or legally responsible person no longer wishes to receive these services"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.3*

9. **Key says:** discharge: a more appropriate treatment modality is required
   **Text says:** "based on presentation and failure to show improvement, despite modifications in the treatment plan, requires a more appropriate best practice or evidence-based treatment modality"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.3*

10. **Key says:** caveat: telephonic criteria are in 3.2.2, referenced from 3.1.2
   **Text says:** "Refer to Subsection 3.2.2 for Telephonic-Specific Criteria"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.1.2*

11. **Key says:** caveat: telephonic services have their own criteria
   **Text says:** "Medicaid shall cover telephonic services when the following criteria are met"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.2*

12. **Key says:** caveat: psychological testing has additional criteria in 3.2.1.4
   **Text says:** "ALL of the following criteria are necessary entrance criteria for psychological testing services"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 3.2.1.4*

<details><summary>Original key and what was wrong with it</summary>

Clinical Coverage Policy 8C defines behavioral health service criteria across three phases: Entrance criteria (section 3.2.1.1) specify the clinical conditions and functional impairments required for initial authorization. Continued service criteria (section 3.2.1.2) require documented progress or ongoing medical necessity. Discharge criteria (section 3.2.1.3) are met when goals are achieved, patient is stable, or a higher level of care is needed.

- Discharge when 'patient is stable': 3.2.1.3 does not list stability as a discharge criterion.
- Discharge when 'a higher level of care is needed': 3.2.1.3 speaks of a more appropriate treatment modality, not a higher level of care; a higher level of care appears only in the entrance criteria (3.2.1.1).
- Discharge when 'goals are achieved': 3.2.1.3 says functioning has improved with respect to the goals; under 3.2.1.2 achieving current goals can support continued service when further goals are indicated.
- Entrance criteria are 'required for initial authorization': 3.2.1.1 says they are necessary for admission to outpatient treatment services and does not mention authorization.
- Continued service requires 'ongoing medical necessity': that phrase is not in 3.2.1.2, which sets a two-part test.
- Caveat placing telephonic criteria in 3.1.2: 3.1.2 says when telephonic delivery is reserved and sends the reader to 3.2.2 for the telephonic-specific criteria.

</details>

---

## q-017

**Question.** What ambulance services are NOT covered by NC Medicaid?

**Proposed key.** Under Clinical Coverage Policy 15 (Ambulance Services), Section 4.2.1.4 lists other ambulance services that are not covered by Medicaid. Non-covered services include an ambulance that is called when no treatment is needed, a response to a false alarm call, a call where the beneficiary refuses all medical services, transport for a medical service that is not a Medicaid covered service, commercial airline tickets, airstrip fees and waiting fees. Other exclusions in the policy include transport of a beneficiary pronounced dead before the ambulance is called, transport for routine pregnancies, ambulance services for beneficiaries whose Medicaid coverage is through Family Planning, and air medical ambulance transport to a facility that is not an acute-care hospital.

**Caveats.** EPSDT exception may apply for beneficiaries under 21; Emergency ambulance transport has different rules than non-emergency

**Check each pair: does the policy text say what the key says?**

1. **Key says:** no treatment needed, false alarm, refused services, transport for a non-covered service
   **Text says:** "An ambulance is called, and no treatment is needed. The ambulance responds to a false alarm call. The beneficiary refuses all medical services. Ambulance transport is for a medical service that is not a Medicaid covered service."
   *Policy 15 (Ambulance Services), 4.2.1.4*

2. **Key says:** commercial airline tickets and airstrip fees
   **Text says:** "Commercial airline tickets are not reimbursable. Airstrip fees are not covered."
   *Policy 15 (Ambulance Services), 4.2.1.4*

3. **Key says:** waiting fees
   **Text says:** "Waiting fees are not covered."
   *Policy 15 (Ambulance Services), 4.2.1.4*

4. **Key says:** deceased beneficiary exclusion
   **Text says:** "Ambulance transport of a deceased beneficiary is not covered if the beneficiary is pronounced dead by a legally authorized individual before the ambulance is called."
   *Policy 15 (Ambulance Services), 4.2.1.2*

5. **Key says:** routine pregnancy exclusion
   **Text says:** "Ambulance transport for beneficiaries with routine pregnancies is not covered."
   *Policy 15 (Ambulance Services), 4.2.2.1*

6. **Key says:** Family Planning beneficiaries are not covered for ambulance services
   **Text says:** "Beneficiaries with Medicaid coverage through Family Planning are not covered to receive ambulance services."
   *Policy 15 (Ambulance Services), 4.2.2.1*

7. **Key says:** air transport to a facility that is not an acute-care hospital is not covered
   **Text says:** "Air medical ambulance transport to a facility that is not an acute-care hospital is not a covered service."
   *Policy 15 (Ambulance Services), 4.2.1.3*

8. **Key says:** caveat: EPSDT exception for beneficiaries under 21
   **Text says:** "Note: Refer to Subsection 2.2.1 regarding EPSDT Exception to Policy Limitations for a Medicaid Beneficiary under 21 Years of Age."
   *Policy 15 (Ambulance Services), 4.0*

9. **Key says:** caveat: emergency side of the contrast (no prior approval for in-state emergency services)
   **Text says:** "PA is not required for in-state emergency ambulance services, ground or air, for Medicaid beneficiaries."
   *Policy 15 (Ambulance Services), 5.1*

10. **Key says:** caveat: non-emergency side of the contrast (prior approval required)
   **Text says:** "For non-emergency medically necessary ambulance transport, PA shall be obtained before service is rendered for a Medicaid beneficiary."
   *Policy 15 (Ambulance Services), 5.2.2*

<details><summary>Original key and what was wrong with it</summary>

Under Clinical Coverage Policy 15 (Ambulance Services), Section 4.2.1.4 lists ambulance services that are not covered by Medicaid. Non-covered services include ambulance transport that is not medically necessary, transport for the convenience of the patient or family, transport to a provider's office when other transportation is available and appropriate, and standby or waiting time charges. Air ambulance transport is only covered when ground transport is contraindicated or the distance to the facility makes ground transport impractical.

- Section 4.2.1.4 lists transport that is not medically necessary (the section does not say this)
- Transport for the convenience of the patient or family is not covered (no such statement anywhere in Policy 15)
- Transport to a provider's office when other transportation is available is not covered (contradicted: section 3.2.2.1 lists a physician's office as a covered destination, subject to the non-emergency criteria in 3.2.2.2)
- Standby charges are not covered (the section names only waiting fees)
- Air ambulance is covered when distance makes ground transport impractical (section 3.2.1.1 gives no distance test)

</details>

---

## q-022

**Question.** What are the specific criteria for NC Medicaid coverage of CAR-T cell therapy?

**Proposed key.** Clinical Coverage Policy 11A-17 covers CAR T-Cell Therapy under NC Medicaid. Section 3.2.1 requires that ALL of the following be met: the therapy has received U.S. FDA approval; it is administered per U.S. FDA approved guidelines, including those on indications and usage; and it is administered at a certified or authorized treatment center, which must be enrolled in the REMS program if the therapy is subject to one, with providers trained on the management of cytokine release syndrome and neurological toxicities. The therapy must also be medically necessary under the general criteria in Section 3.1. Section 4.2.1 excludes, among other things, repeat treatment in a beneficiary who has previously received another CAR T-Cell Therapy.

**Caveats.** Prior authorization is required; Coverage may be limited to specific FDA-approved indications

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy covers CAR T-Cell Therapy; all criteria must be met; FDA approval is the first criterion
   **Text says:** "Medicaid shall cover CAR T-Cell Therapy when ALL of the following criteria are met: the CAR T-Cell Therapy has received approval from the United States Food & Drug Administration (U.S. FDA)"
   *Policy 11A-17 (CAR-T Cell Therapy), 3.2.1*

2. **Key says:** Administration per FDA approved guidelines, including indications and usage
   **Text says:** "the CAR T-Cell Therapy is administered per U.S. FDA approved guidelines regarding: indications and usage; dosage and administration; dosage forms and strengths; and warnings and precautions"
   *Policy 11A-17 (CAR-T Cell Therapy), 3.2.1*

3. **Key says:** Certified or authorized treatment center
   **Text says:** "the CAR T-cell Therapy is administered at a certified or authorized treatment center"
   *Policy 11A-17 (CAR-T Cell Therapy), 3.2.1*

4. **Key says:** Treatment center must be enrolled in the REMS program if the therapy is subject to one
   **Text says:** "If the therapy is subject to a Risk Evaluation and Mitigation Strategies (REMS) program, the treatment center must be enrolled in the REMS, and providers must be trained on the management of cytokine release syndrome (CRS) and neurological toxicities"
   *Policy 11A-17 (CAR-T Cell Therapy), 3.2.1*

5. **Key says:** The therapy must be medically necessary and meet the general coverage criteria in Section 3.1
   **Text says:** "Medicaid shall cover the procedure, product, or service related to this policy when medically necessary"
   *Policy 11A-17 (CAR-T Cell Therapy), 3.1*

6. **Key says:** Section 4.2.1 excludes repeat treatment after another CAR T-Cell Therapy
   **Text says:** "repeat treatment in beneficiaries who have received another CAR T-Cell Therapy previously"
   *Policy 11A-17 (CAR-T Cell Therapy), 4.2.1*

7. **Key says:** Caveat: coverage is limited to FDA-approved indications
   **Text says:** "the CAR T-Cell Therapy is being administered outside U.S. FDA guidelines regarding: indications and usage; dosage and administration; or dosage forms and strengths"
   *Policy 11A-17 (CAR-T Cell Therapy), 4.2.1*

8. **Key says:** Caveat: prior authorization is required
   **Text says:** "Medicaid shall require prior approval for CAR T-Cell Therapy."
   *Policy 11A-17 (CAR-T Cell Therapy), 5.1*

<details><summary>Original key and what was wrong with it</summary>

Clinical Coverage Policy 11A-17 covers CAR-T Cell Therapy under NC Medicaid. Section 3.2.1 specifies the criteria that must be met for Medicaid coverage, including the specific diagnoses for which CAR-T is indicated, the clinical conditions that must be present, and the treatment setting requirements. The therapy must be medically necessary, provided by an approved transplant center, and meet all general Medicaid coverage criteria.

- Section 3.2.1 includes 'the specific diagnoses for which CAR-T is indicated' (it names no diagnoses)
- Section 3.2.1 includes 'the clinical conditions that must be present' (it lists no clinical conditions)
- The therapy must be 'provided by an approved transplant center' (the section says 'certified or authorized treatment center')
- Caveat: 'CAR-T coverage criteria evolve rapidly as new products receive FDA approval' (no section says this)

</details>

---

## q-027

**Question.** Does Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity) cover bariatric / body-contouring surgery performed purely for cosmetic weight-loss reasons?

**Proposed key.** No. Policy 1A-15 covers a bariatric surgical procedure for clinically severe or morbid obesity only when health records show the beneficiary has met all the clinical criteria in section 3.2.1, which include a diagnosis of morbid obesity, or clinically severe obesity with a listed co-morbid condition, and demonstrated attempts to lose weight through non-surgical means. Section 4.2.1 lists what is not covered: it includes bariatric surgical procedures for a beneficiary with a BMI less than 35 kg/m2 and, under the heading "Cosmetic surgery", surgical removal of the skin and fat folds that can follow bariatric weight loss when done for solely cosmetic purposes.

**Caveats.** EPSDT exception may apply for beneficiaries under 21 when medically necessary

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Coverage only when health records show the beneficiary has met all the clinical criteria in section 3.2.1
   **Text says:** "Medicaid shall cover a bariatric surgical procedure for clinically severe or morbid obesity when health records substantiate that a beneficiary has met ALL the criteria in section 3.2.1 of this policy"
   *Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity), 3.2.1*

2. **Key says:** Criterion: diagnosis of morbid obesity, or clinically severe obesity with a listed co-morbid condition
   **Text says:** "A diagnosis of morbid obesity, or clinically severe obesity with at least ONE of the following conditions"
   *Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity), 3.2.1*

3. **Key says:** Criterion: demonstrated attempts to lose weight through non-surgical means
   **Text says:** "the beneficiary has demonstrated evidence of attempts to lose weight through non-surgical means"
   *Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity), 3.2.1*

4. **Key says:** Bariatric procedures for a beneficiary with BMI under 35 are not covered
   **Text says:** "Bariatric surgical procedures for a beneficiary with a BMI less than 35 kg/m 2"
   *Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity), 4.2.1*

5. **Key says:** Removal of post-weight-loss skin and fat folds for solely cosmetic purposes is not covered
   **Text says:** "Cosmetic surgery: Weight loss following bariatric surgical procedures can result in skin and fat folds in locations such as the medial upper arms, lower abdominal area, and medial thighs. Surgical removal of this skin and fat for solely cosmetic purposes is not covered."
   *Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity), 4.2.1*

6. **Key says:** Caveat: EPSDT exception for beneficiaries under 21 when medically necessary
   **Text says:** "Service limitations on scope, amount, duration, frequency, location of service, and other specific criteria described in clinical coverage policies may be exceeded or may not apply as long as the provider's documentation shows that the requested service is medically necessary"
   *Policy 1A-15 (Surgery for Clinically Severe or Morbid Obesity), a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 1A-15 covers surgery for clinically severe or morbid obesity only when the beneficiary meets the policy's documented clinical criteria (BMI thresholds, failure of conservative management, medical necessity). Procedures performed solely for cosmetic weight-loss or body-contouring purposes — without meeting the clinical-severity criteria in section 2.1.1 — are not covered; section 4.1 confirms cosmetic procedures are a general exclusion.

- 'the clinical-severity criteria in section 2.1.1' (2.1.1 is generic eligibility text with no clinical criteria; the criteria are in 3.2.1)
- 'section 4.1 confirms cosmetic procedures are a general exclusion' (4.1 does not mention cosmetic procedures; the cosmetic exclusion is in 4.2.1 and is limited to surgical removal of skin and fat after bariatric weight loss for solely cosmetic purposes)
- 'medical necessity' listed as one of this policy's documented clinical criteria (it is the generic 3.1 rule, not a criterion in 3.2.1)

</details>

---

## q-038

**Question.** Does the CAP/DA waiver cover a beneficiary's room and board in their own home?

**Proposed key.** No. CAP/DA is a Medicaid Home and Community-Based Services (HCBS) waiver, and under 42 CFR 441.310 federal funding for HCBS waiver services is not available for the cost of room and board, apart from narrow exceptions. Policy 3K-2 says community integration services do not cover room and board and do not include monthly rental or mortgage expense, food, or regular utility charges, and community transition services do not include rent or back rent. The waiver funds services such as in-home aide, personal assistance and case management that allow a beneficiary to remain in or return to a home and community-based setting.

**Caveats.** The exceptions in 42 CFR 441.310 concern room and board that is part of respite care in a State-approved facility that is not a private residence, and an unrelated live-in caregiver's share of rent and food in waivers that allow personal caregivers as providers, each with its own conditions; Policy 3K-2 says its coordinated caregiving reimbursement rate does not include room and board; Community transition services, for a beneficiary moving from an institution to the community, may cover set-up costs such as a security deposit or first month's rent required to obtain a lease and utility set-up fees or deposits, but not rent or back rent

**Check each pair: does the policy text say what the key says?**

1. **Key says:** CAP/DA is a Medicaid HCBS waiver
   **Text says:** "The Community Alternatives Program for Disabled Adults (CAP/DA) is a Medicaid Home and Community-Based Services (HCBS) Waiver authorized under section1915(c) of the Social Security Act"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

2. **Key says:** Federal funding for HCBS waiver services is unavailable for listed costs
   **Text says:** "FFP for home and community-based services listed in § 440.180 of this chapter is not available in expenditures for the following:"
   *42 CFR § 441.310*

3. **Key says:** Room and board is excluded from federal funding, with the respite-facility and live-in-caregiver exceptions (answer and caveat)
   **Text says:** "The cost of room and board except when provided as— (i) Part of respite care services in a facility approved by the State that is not a private residence; or (ii) For waivers that allow personal caregivers as providers of approved waiver services, a portion of the rent and food that may be reasonably attributed to the unrelated caregiver who resides in the same household with the waiver beneficiary."
   *42 CFR § 441.310*

4. **Key says:** Community integration services do not cover room and board
   **Text says:** "Community Integration services are available to cover tenancy-related issues, not to exceed $2,500 over the CAP/DA Waiver approval cycle. These services do not cover room and board."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 5.8.6*

5. **Key says:** Community integration services do not include rent or mortgage, food, or regular utility charges
   **Text says:** "Community Integration Services do not include monthly rental or mortgage expense; food, regular utility charges;"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Limits, Amount And Frequency*

6. **Key says:** Waiver services include case management and personal assistance
   **Text says:** "Case management - case management and care advisement; Personal assistance; and Financial management."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), The CAP/DA waiver services are:*

7. **Key says:** The services allow the beneficiary to remain in or return to a home and community-based setting
   **Text says:** "These services allow this targeted individual to remain in or return to a home and community-based setting."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

8. **Key says:** In-home aide is a CAP/DA waiver service
   **Text says:** "Adult day health; CAP In-home aide I & II;"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), The CAP/DA waiver services are:*

9. **Key says:** Community transition services are for a beneficiary moving from an institution to the community
   **Text says:** "A service for a prospective CAP/DA beneficiary for transitioning from an institutional setting to a community setting."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), COMMUNITY TRANSITION SERVICES*

10. **Key says:** Transition services may cover a security deposit or first month's rent and utility set-up fees or deposits
   **Text says:** "Security deposits or other such payments (such as first month's rent) required to obtain a lease on an apartment or home; Set-up fees or deposits for utility or service access (such as telephone, electricity, heating)"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), COMMUNITY TRANSITION SERVICES*

11. **Key says:** Community transition services do not include rent or back rent (answer and caveat)
   **Text says:** "This service does not include rent or back rent payments."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), COMMUNITY TRANSITION SERVICES*

12. **Key says:** caveat: Policy 3K-2's coordinated caregiving rate does not include room and board
   **Text says:** "The coordinated caregiving Medicaid reimbursement rate does not include room and board."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Limits, Amount And Frequency*

13. **Key says:** caveat: the live-in caregiver exception has its own conditions
   **Text says:** "FFP for a live-in caregiver is not available if the beneficiary lives in the caregiver's home or in a residence that is owned or leased by the provider of Medicaid services (the caregiver)."
   *42 CFR § 441.310*

<details><summary>Original key and what was wrong with it</summary>

No. CAP/DA is a home- and community-based services (HCBS) waiver; by federal design it cannot pay for a beneficiary's room and board in their own home. The waiver funds in-home services (personal care, case management, assistive technology, etc.) that support community living, but rent, utilities, and groceries are explicitly excluded.

- 'rent, utilities, and groceries are explicitly excluded' as a waiver-wide rule: Policy 3K-2 has no general room-and-board exclusion; it excludes room and board within specific services, and it does not use the word 'groceries'
- 'personal care' and 'assistive technology' as waiver service names: the policy lists 'CAP In-home aide I & II', 'Personal assistance' and 'Equipment, modification and technology'
- Caveat 'except in very narrow respite situations': 42 CFR 441.310(a)(2) has a second exception for rent and food attributable to an unrelated live-in caregiver
- Section 4.1 as the source: it is generic template text and says nothing about room and board

</details>

---

## q-047

**Question.** Which federal regulation governs timeliness requirements for state Medicaid plan amendments (SPAs)?

**Proposed key.** 42 CFR § 430.12 governs the submittal of the state Medicaid plan and plan amendments. It requires the plan to be amended whenever necessary to reflect, among other things, changes in Federal law or material changes in State law, organization, or policy, and it states that prompt submittal of amendments is necessary so that CMS can determine whether the plan continues to meet the requirements for approval. The federal review timeline is not in § 430.12; it is in 42 CFR § 430.16, under which a plan amendment is considered approved unless CMS, within 90 days after receipt in the regional office, sends the State written notice of disapproval or of additional information it needs.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** § 430.12 requires the plan to be amended whenever necessary to reflect the listed changes
   **Text says:** "(c) Plan amendments. (1) The plan must provide that it will be amended whenever necessary to reflect— (i) Changes in Federal law, regulations, policy interpretations, or court decisions; or (ii) Material changes in State law, organization, or policy, or in the State's operation of the Medicaid program."
   *42 CFR § 430.12*

2. **Key says:** Prompt submittal of amendments is necessary, and why
   **Text says:** "(2) Prompt submittal of amendments is necessary— (i) So that CMS can determine whether the plan continues to meet the requirements for approval; and (ii) To ensure the availability of FFP in accordance with § 430.20."
   *42 CFR § 430.12*

3. **Key says:** The 60-day deadline applies to advance directive changes
   **Text says:** "For changes related to advance directive requirements, amendments must be submitted as soon as possible, but no later than 60 days from the effective date of the change to State law concerning advance directives."
   *42 CFR § 430.12*

4. **Key says:** § 430.16: 90-day CMS review period
   **Text says:** "A State plan or plan amendment will be considered approved unless CMS, within 90 days after receipt of the plan or plan amendment in the regional office, sends the State— (i) Written notice of disapproval; or (ii) Written notice of any additional information it needs in order to make a final determination."
   *42 CFR § 430.16*

5. **Key says:** The 90-day period restarts when CMS receives requested information
   **Text says:** "If CMS requests additional information, the 90-day period for CMS action on the plan or plan amendment begins on the day it receives that information."
   *42 CFR § 430.16*

<details><summary>Original key and what was wrong with it</summary>

42 CFR § 430.12 governs the submission and amendment of the state Medicaid plan, including requirements for timely submission of plan amendments to CMS for review and approval. It establishes when states must submit SPAs and the federal review timeline.

- § 430.12 establishes the federal review timeline: it does not; the 90-day CMS action period is in § 430.16
- § 430.12 'establishes when states must submit SPAs': it sets no general deadline, only that prompt submittal is necessary, plus a 60-day limit for advance directive changes

</details>

---

# Part 2: the other validated keys (31 keys)

## q-002

**Question.** What DME items are specifically NOT covered by NC Medicaid under the Orthotics and Prosthetics policy, and what general criteria must be met for coverage?

**Proposed key.** Under Clinical Coverage Policy 5B (Orthotics and Prosthetics), coverage requires that items meet the general criteria in section 3.1, including medical necessity, and the specific criteria in section 3.2.1, including being ordered by a physician, physician assistant, or nurse practitioner. Items not covered are described in section 4.1 general exclusions and 4.2.1 specific exclusions, which include items for comfort or convenience, duplicate devices, and experimental equipment.

**Caveats.** EPSDT exception may expand coverage for beneficiaries under 21 per section 2.2.1

**Check each pair: does the policy text say what the key says?**

1. **Key says:** general criteria in section 3.1 include medical necessity
   **Text says:** "Medicaid shall cover the procedure, product, or service related to this policy when medically necessary"
   *Policy 5B (Orthotics & Prosthetics), 3.1*

2. **Key says:** specific criteria in section 3.2.1 include being ordered by a physician, physician assistant, or nurse practitioner
   **Text says:** "they are ordered by a physician, physician assistant, or nurse practitioner"
   *Policy 5B (Orthotics & Prosthetics), 3.2.1*

3. **Key says:** 4.2.1 excludes items for comfort or convenience
   **Text says:** "Devices for the beneficiary's comfort or convenience or for the convenience of the beneficiary's caregiver(s)"
   *Policy 5B (Orthotics & Prosthetics), 4.2.1*

4. **Key says:** 4.2.1 excludes duplicate devices
   **Text says:** "Devices to have on hand for backup or duplicates to have available at various locations"
   *Policy 5B (Orthotics & Prosthetics), 4.2.1*

5. **Key says:** 4.1 excludes experimental equipment
   **Text says:** "the procedure, product, or service is experimental, investigational, or part of a clinical trial"
   *Policy 5B (Orthotics & Prosthetics), 4.1*

6. **Key says:** caveat: EPSDT may expand coverage for beneficiaries under 21 per section 2.2.1
   **Text says:** "Service limitations on scope, amount, duration, frequency, location of service, and other specific criteria described in clinical coverage policies may be exceeded or may not apply as long as the provider's documentation shows that the requested service is medically necessary"
   *Policy 5B (Orthotics & Prosthetics), 2.2.1*

<details><summary>Original key and what was wrong with it</summary>

Under Clinical Coverage Policy 5B (Orthotics and Prosthetics), coverage requires that items meet general criteria in section 3.1 including medical necessity and appropriate prescribing. Items not covered are described in section 4.1 general exclusions and 4.2.1 specific exclusions, which include items for comfort or convenience, duplicate devices, and experimental equipment. A beneficiary must first meet general coverage criteria before specific items are evaluated.

- Section 3.1 includes 'appropriate prescribing' as a general criterion: 3.1 does not mention prescribing or ordering; the ordering requirement is in 3.2.1.
- 'A beneficiary must first meet general coverage criteria before specific items are evaluated': the policy states no such order of evaluation; 4.1 says only that an item is not covered when the Section 3.0 criteria are not met.

</details>

---

## q-006

**Question.** Does NC Medicaid cover chiropractic services under Clinical Coverage Policy 5B?

**Proposed key.** Chiropractic services are not a covered benefit under Clinical Coverage Policy 5B (Orthotics and Prosthetics). Policy 5B covers orthotic and prosthetic devices; fitting is included in the payment for a device and is not paid separately. Policy 5B does not mention chiropractic services, which are a distinct service not addressed under this policy.

**Caveats.** Chiropractic services are addressed under a separate clinical coverage policy, Chiropractic Services

**Check each pair: does the policy text say what the key says?**

1. **Key says:** this document is Clinical Coverage Policy 5B
   **Text says:** "Clinical Coverage Policy No: 5B"
   *Policy 5B (Orthotics & Prosthetics), Orthotics & Prosthetics*

2. **Key says:** Policy 5B covers orthotic and prosthetic devices
   **Text says:** "Orthotic and prosthetic devices are covered by NC Medicaid (Medicaid) when they are prescribed by the beneficiary's treating physician, physician's assistant, or nurse practitioner and medical necessity is documented"
   *Policy 5B (Orthotics & Prosthetics), 1.0*

3. **Key says:** Policy 5B's coverage criteria concern orthotics and prosthetics only
   **Text says:** "Medicaid shall cover orthotics and prosthetics when the beneficiary meets all the following specific criteria"
   *Policy 5B (Orthotics & Prosthetics), 3.2.1*

4. **Key says:** fitting is included in the payment for a device
   **Text says:** "Payment for all devices includes delivery to the beneficiary as well as any required fitting or assembly"
   *Policy 5B (Orthotics & Prosthetics), H. Reimbursement*

5. **Key says:** fitting is not paid separately
   **Text says:** "Medicaid does not pay separately for travel time, shipping costs, delivery, fitting, or assembly of orthotic and prosthetic devices"
   *Policy 5B (Orthotics & Prosthetics), H. Reimbursement*

6. **Key says:** caveat: chiropractic services are addressed under the separate Chiropractic Services policy
   **Text says:** "Medicaid shall cover chiropractic services when the beneficiary meets the following specific criteria"
   *Policy 1F (Chiropractic Services), 3.2.1*

<details><summary>Original key and what was wrong with it</summary>

Chiropractic services are not a covered benefit under Clinical Coverage Policy 5B (Orthotics and Prosthetics). Policy 5B specifically covers orthotic and prosthetic devices and related fitting services. Chiropractic manipulative treatment is a distinct service category not addressed under this policy.

- Policy 5B covers 'related fitting services': 5B says fitting is included in the device payment and is not paid separately; it is not a covered service of its own.
- 'Chiropractic manipulative treatment' as a named service category: the term does not appear in Policy 5B.
- The original evidence (4.1 and 2.1.1) is template text that says nothing about the policy's scope or about chiropractic services.

</details>

---

## q-007

**Question.** What is the treatment plan (plan of care) requirement for outpatient therapy services under NC Medicaid policy 10A?

**Proposed key.** Clinical Coverage Policy 10A section 3.2.1.6 specifies Treatment Plan (Plan of Care) requirements for outpatient therapy services. A treatment plan must be established after the evaluation and before treatment begins, signed by the professional completing it, and reviewed by the service provider at least every six calendar months. The plan, together with the evaluation report, must include, among other elements, the treatment diagnosis, measurable goals, frequency of services, and the plan's duration (no more than six calendar months).

**Check each pair: does the policy text say what the key says?**

1. **Key says:** this document is Clinical Coverage Policy 10A
   **Text says:** "Clinical Coverage Policy No: 10A"
   *Policy 10A (Outpatient Specialized Therapies), Outpatient Specialized Therapy (OST)*

2. **Key says:** the 3.2.1.x criteria apply to outpatient therapy services
   **Text says:** "Medicaid shall cover Outpatient Specialized Therapy (OST) Services when the beneficiary meets the following specific criteria:"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1*

3. **Key says:** must be established after the evaluation and before treatment begins
   **Text says:** "The treatment plan must be established once an evaluation has been administered and prior to the beginning of treatment services"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

4. **Key says:** signed by the professional completing it
   **Text says:** "name, credentials and signature of professional completing the treatment plan dated on or prior to the start date of the treatment plan"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

5. **Key says:** reviewed by the service provider at least every six calendar months
   **Text says:** "Service providers shall review, and renew or revise, each treatment plan and its goals at least every six calendar months"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

6. **Key says:** the plan must document the treatment diagnosis
   **Text says:** "discipline-specific treatment diagnosis and any related medical diagnoses"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

7. **Key says:** must include measurable goals
   **Text says:** "defined discipline-specific and measurable goals that have reasonable expectation to be achieved within the duration of the therapy plan"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

8. **Key says:** must include the plan's duration (no more than six calendar months)
   **Text says:** "duration of the therapy treatment plan consisting of the start and end date (no more than six calendar months)"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

9. **Key says:** the plan must document frequency of services
   **Text says:** "frequency of services"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

10. **Key says:** the plan, together with the evaluation report, must include the listed elements
   **Text says:** "Each treatment plan in combination with the evaluation or re-evaluation written report must include ALL of the following criteria"
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.6*

<details><summary>Original key and what was wrong with it</summary>

Clinical Coverage Policy 10A section 3.2.1.6 specifies Treatment Plan (Plan of Care) requirements for outpatient therapy services. A treatment plan must be established, signed, and periodically reviewed by the treating provider. The plan must document the patient's functional deficits, treatment goals, frequency and duration of services, and the expected outcomes.

- The plan must document 'the patient's functional deficits': 3.2.1.6 does not list functional deficits; it lists the discipline-specific treatment diagnosis and related medical diagnoses.
- The plan must document 'the expected outcomes': 3.2.1.6 does not list expected outcomes as a plan element; it requires measurable goals.
- 'duration of services': the listed element is the duration of the treatment plan (start and end date, no more than six calendar months), and the elements are required of the plan in combination with the evaluation report.

</details>

---

## q-008

**Question.** Can a CAP/DA beneficiary transfer between service providers, and what rules govern transfers of eligible beneficiaries?

**Proposed key.** Yes, a CAP/DA beneficiary may change provider agencies: Clinical Coverage Policy 3K-2 requires a POC update and a signed freedom of choice form consenting to the change in providers. Section 3.3, Transfers of Eligible Beneficiaries, governs a different kind of transfer, to another county or CME: the CME must coordinate it by the agreed transition date or in less than 30 calendar days of the request, preventing gaps in service, and the beneficiary remains eligible for CAP/DA regardless of county of residence.

**Caveats.** Section 5.4.5 says a POC revision is required when there are changes in a service provider, while the change-of-provider-agency text says the POC update is not considered a revision.; For a transfer to another case management entity, Appendix B also requires a root cause analysis within five business days and NC Medicaid's approval of the transfer.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Yes, a beneficiary may change provider agencies
   **Text says:** "Ensure the beneficiary's right to choose among providers as evidenced by a signed freedom of choice form"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 5.4.2*

2. **Key says:** a change of provider agency requires a POC update
   **Text says:** "A POC update is required for a change in provider agency, but the change is not considered a revision."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Documenting a change of provider agency:*

3. **Key says:** a signed freedom of choice form consenting to the change in providers
   **Text says:** "The CME designee obtains a signed freedom of choice form from the beneficiary or the responsible party consenting to the change in providers."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Documenting a change of provider agency:*

4. **Key says:** section 3.3 governs transfers to another county or entity; the CME coordinates by the agreed date or in less than 30 calendar days
   **Text says:** "the CME shall coordinate the transfer of an eligible CAP/DA beneficiary to another county or entity within the approved, agreed upon transition date or less than 30 calendar days of the request to transfer"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 3.3*

5. **Key says:** the transfer is to another county or CME
   **Text says:** "An eligible CAP/DA beneficiary who is transferring to another county or CME"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 3.2.4*

6. **Key says:** preventing gaps in service
   **Text says:** "CME shall coordinate the transfer to prevent gaps in service provisions."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 3.3*

7. **Key says:** the beneficiary remains eligible regardless of county of residence
   **Text says:** "A transferring beneficiary continues to be eligible for CAP/DA regardless of their county of residence."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 3.3*

8. **Key says:** caveat: 5.4.5 calls a change in service provider a POC revision
   **Text says:** "A plan of care (POC) revision is required when a request is made to add, reduce, increase, delete a CAP/DA service or Medicaid State service, or when there are changes in a service provider."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 5.4.5*

9. **Key says:** caveat: a transfer to another case management entity requires a root cause analysis within five business days
   **Text says:** "If a request is made to transfer to another case management entity, a root cause analysis must be performed within five business days"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), COORDINATION OF CARE: CASE MANAGEMENT AND CARE ADVISEMENT*

10. **Key says:** caveat: NC Medicaid's approval of the transfer
   **Text says:** "NC Medicaid shall approve the transfer of CME."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), COORDINATION OF CARE: CASE MANAGEMENT AND CARE ADVISEMENT*

<details><summary>Original key and what was wrong with it</summary>

Yes, CAP/DA beneficiaries may transfer between providers. Clinical Coverage Policy 3K-2 section 3.3 governs transfers of eligible beneficiaries and outlines the process and conditions under which a beneficiary may change their CAP/DA service provider while maintaining continuity of care. The transfer process must comply with NC Medicaid's enrollment and authorization requirements.

- Section 3.3 outlines the process and conditions under which a beneficiary may change their CAP/DA service provider (3.3 covers transfers to another county or case management entity, not changes of service provider)
- The transfer process must comply with NC Medicaid's enrollment and authorization requirements (not stated in 3.3 or in the change-of-provider section)
- Caveat that timelines and steps may be detailed in operational guidance beyond the policy (nothing in 3K-2 points to outside guidance for transfers; 3.3 itself gives the timelines and steps)

</details>

---

## q-009

**Question.** Is there a maximum earned income limit for people on HCWD (Health Coverage for Workers with Disabilities), and what premiums apply?

**Proposed key.** There is no maximum earned income limit for HCWD. The HCWD changes in Change Notice for Manual No. 01-14 removed the 150% FPL cap on income. The only income limit is 150% FPL on unearned income. Beneficiaries with countable income above 150% FPL must pay a $50 per certification period enrollment fee. Those with countable income above 200% FPL must also pay a sliding-scale monthly premium that increases with income. HCWD covers individuals regardless of total countable income.

**Caveats.** Premium amounts are updated periodically — verify current schedule; Work must be competitive and inclusive unless self-employed

**Check each pair: does the policy text say what the key says?**

1. **Key says:** the source is Change Notice for Manual No. 01-14
   **Text says:** "Manual: Aged, Blind, and Disabled Medicaid Change No: 01-14"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, DMA CHANGE NOTICE FOR MANUAL 01-14*

2. **Key says:** No earned income limit; the only income limit is 150% FPL on unearned income
   **Text says:** "The only income limit for the HCWD program is a 150% FPL limit on unearned income."
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, I. BACKGROUND*

3. **Key says:** No limit on countable (including earned) income other than the unearned income cap; premiums are sliding scale
   **Text says:** "to remove limits on countable income except for the 150% of Federal Poverty Level (FPL) cap on unearned income and provide information about sliding scale premiums"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:*

4. **Key says:** The change notice removed the 150% FPL income limit from policy
   **Text says:** "to remove the 150% FPL income limit from policy"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, A. MA-500, Classification, is revised in:*

5. **Key says:** The change notice removed the 150% FPL cap on income
   **Text says:** "to remove references to a 150% FPL cap on income for HCWD"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, C. MA-2100, Categorically Needy No Money Payment, is revised in:*

6. **Key says:** $50 per certification period enrollment fee above 150% FPL
   **Text says:** "those with countable incomes greater than 150% FPL must pay a $50 per certification period (yearly) enrollment fee"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:*

7. **Key says:** Premium above 200% FPL, in addition to the enrollment fee
   **Text says:** "those with countable incomes greater than 200% FPL must pay a premium in addition to an enrollment fee"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:*

8. **Key says:** The premium is monthly and based on income
   **Text says:** "those with incomes above 200% FPL must pay a monthly premium, based on income, as well as the yearly enrollment fee"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, I. BACKGROUND*

9. **Key says:** HCWD covers individuals regardless of total countable income
   **Text says:** "to state that HCWD covers individuals regardless of total countable income or CAP status"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:*

10. **Key says:** Work must be competitive and inclusive unless self-employed (answer and caveat)
   **Text says:** "clarify that work must be competitive and inclusive unless individual is self-employed"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:*

11. **Key says:** the premium increases with income
   **Text says:** "The premiums increase with income range"
   *CHANGE NOTICE FOR MANUAL NO. 01-14, HCWD Phase III, D. MA-2180, Health Coverage for Workers with Disabilities, is revised in:*

Not checked against the corpus (advice to the reader, not a statement of policy): Premium amounts are updated periodically — verify current schedule

<details><summary>Original key and what was wrong with it</summary>

There is no maximum earned income limit for HCWD. The HCWD Phase III changes (Change Notice for Manual No. 01-14) removed the 150% FPL cap on earned income. The only income limit is 150% FPL on unearned income. Beneficiaries with countable income above 150% FPL must pay a $50 per certification period enrollment fee. Those with countable income above 200% FPL must also pay a sliding-scale monthly premium that increases with income. HCWD covers individuals regardless of total countable income, as long as they are working in competitive, inclusive employment (or self-employed) and meet disability criteria.

- 'removed the 150% FPL cap on earned income': the notice describes removing the 150% FPL income limit / cap on income, not a cap specific to earned income
- 'Phase III': the phrase is in the indexed document title only, not in any section text
- 'and meet disability criteria': the notice does not state disability criteria as a condition in these terms
- Caveat 'SSI must have been terminated for non-medical reasons to qualify': the notice only says section IV.B.2.b. of MA-2180 adds the qualification 'for non-medical reasons' to one provision; it does not say this is a general condition of qualifying

</details>

---

## q-010

**Question.** What is the federal statutory authority for NC's CAP/DA waiver, and what does the state need to demonstrate in its waiver application?

**Proposed key.** CAP/DA is a Medicaid home and community-based services (HCBS) waiver authorized under Section 1915(c) of the Social Security Act, which, as Policy 3K-2 describes it, authorizes the Secretary of Health and Human Services to waive certain Medicaid statutory requirements so that a state may offer HCBS to target groups of beneficiaries who meet a nursing facility level of care. Under 42 CFR 441.301, the state's waiver request must describe the services to be furnished and the group or groups of individuals to whom they will be offered, and must include the assurances required by 42 CFR 441.302, among them that necessary safeguards protect beneficiaries' health and welfare. 42 CFR 441.303 specifies the supporting documentation required, which includes the number of unduplicated beneficiaries the state intends to serve each year.

**Caveats.** Waiver applications are renewed periodically — the current application may differ from the original; CMS must approve any amendments to the waiver

**Check each pair: does the policy text say what the key says?**

1. **Key says:** CAP/DA is an HCBS waiver authorized under section 1915(c)
   **Text says:** "is a Medicaid Home and Community-Based Services (HCBS) Waiver authorized under section1915(c) of the Social Security Act"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

2. **Key says:** What section 1915(c) authorizes, as described by Policy 3K-2
   **Text says:** "Section 1915 (c) of the Social Security Act authorizes the Secretary of Health and Human Services to waive certain specific Medicaid statuary requirements so that a state may offer HCBS to state-specified target groups of Medicaid beneficiaries who meet a nursing facility level of care"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), These assurances are:*

3. **Key says:** Section 1915(c) is the statutory basis for HCBS waivers
   **Text says:** "Section 1915(c) of the Act permits States to offer, under a waiver of statutory requirements, an array of home and community-based services that an individual needs to avoid institutionalization."
   *42 CFR § 441.300*

4. **Key says:** The request must consist of the 441.302 assurances and 441.303 supporting documentation
   **Text says:** "The assurances required by § 441.302 and the supporting documentation required by § 441.303."
   *42 CFR § 441.301*

5. **Key says:** The request must describe the group(s) to be served
   **Text says:** "Describe the group or groups of individuals to whom the services will be offered;"
   *42 CFR § 441.301*

6. **Key says:** The request must describe the services, each separately defined
   **Text says:** "Describe the services to be furnished so that each service is separately defined."
   *42 CFR § 441.301*

7. **Key says:** the 441.302 assurances include that necessary safeguards protect beneficiaries' health and welfare
   **Text says:** "Unless the Medicaid agency provides the following satisfactory assurances to CMS, CMS will not grant a waiver under this subpart and may terminate a waiver already granted: (a) Health and Welfare —Assurance that necessary safeguards have been taken to protect the health and welfare of the beneficiaries of the services."
   *42 CFR § 441.302*

8. **Key says:** 441.303 specifies the supporting documentation required
   **Text says:** "The agency must furnish CMS with sufficient information to support the assurances required by § 441.302."
   *42 CFR § 441.303*

9. **Key says:** Number of unduplicated beneficiaries to be served each year
   **Text says:** "The State must indicate the number of unduplicated beneficiaries to which it intends to provide waiver services in each year of its program."
   *42 CFR § 441.303*

10. **Key says:** Caveat 1: waivers are approved for a specified time and so are renewed
   **Text says:** "HCBS waivers are approved by Centers of Medicare and Medicaid Services (CMS) for a specified time."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

11. **Key says:** Caveats 1 and 2: renewal, and CMS approval of amendments
   **Text says:** "NC Medicaid can renew or amend the waiver with the approval of CMS."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

<details><summary>Original key and what was wrong with it</summary>

CAP/DA operates under a Section 1915(c) home and community-based services waiver. Section 1915 of the Social Security Act authorizes states to waive certain Medicaid requirements to provide HCBS to individuals who would otherwise require institutional care. Under 42 CFR 441.301, the state's waiver application must describe the services to be provided, the target population, the geographic area, the estimated number of participants, and safeguards to protect health and welfare. 42 CFR 441.303 specifies the supporting documentation required. NC's Clinical Coverage Policy 3K-2 implements the waiver at the state level, defining the specific services, eligibility criteria, and provider requirements.

- 'the geographic area' as something the waiver request must describe under 42 CFR 441.301: the section has no such requirement (it mentions a geographic area only in a conflict-of-interest exception)
- 'the estimated number of participants' and 'safeguards to protect health and welfare' attributed to 441.301: the number is in 441.303 and the safeguards are a 441.302 assurance (described in 441.303), both of which 441.301(a)(1) incorporates
- 'Section 1915 ... authorizes states to waive certain Medicaid requirements': the statute text is not in the corpus; per Policy 3K-2 and 42 CFR 441.300 it is the Secretary who waives requirements so that states may offer HCBS
- 'Policy 3K-2 ... defining the specific services, eligibility criteria, and provider requirements': rested only on generic section 3.1, which says nothing of the kind

</details>

---

## q-015

**Question.** What does federal law define as 'home health services' under Medicaid, and where must they be provided?

**Proposed key.** Under 42 CFR 440.70, 'home health services' means the services listed there (nursing service, home health aide service, medical supplies, equipment and appliances, and therapy services) provided to a beneficiary at his place of residence and on a practitioner's orders as part of a written plan of care. For nursing, home health aide and therapy services, the orders are written by a physician, nurse practitioner, clinical nurse specialist, or physician assistant working in accordance with state law, and the ordering practitioner reviews the plan of care every 60 days. A beneficiary's place of residence does not include a hospital, nursing facility, or intermediate care facility for individuals with intellectual disabilities (with a limited exception for the last). The regulation adds that services may be received in any setting in which normal life activities take place, other than those facilities or a setting where Medicaid pays or could pay for inpatient services that include room and board, and cannot be limited to homebound beneficiaries. NC's Clinical Coverage Policy 3A (Home Health Services) states that it has been updated to comply with 42 CFR 440.70.

**Caveats.** 'Place of residence' definition may vary — verify current interpretation

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Definition: the listed services provided at the beneficiary's place of residence
   **Text says:** "“Home health services” means the services in paragraph (b) of this section that are provided to a beneficiary— (1) At his place of residence, as specified in paragraph (c) of this section;"
   *42 CFR § 440.70*

2. **Key says:** For nursing, aide and therapy services: who may order, written plan of care, 60-day review by the ordering practitioner
   **Text says:** "On orders written by a physician, nurse practitioner, clinical nurse specialist or physician assistant, working in accordance with State law, as part of a written plan of care that the ordering practitioner reviews every 60 days for services described in (b)(1), (2), and (4) of this section"
   *42 CFR § 440.70*

3. **Key says:** Medical supplies, equipment and appliances are also on a practitioner's orders as part of a written plan of care (so the general statement 'on a practitioner's orders as part of a written plan of care' holds for every listed service)
   **Text says:** "On his or her physician's orders or orders written by a licensed practitioner of the healing arts acting within the scope of practice authorized under State law, as part of a written plan of care for services described in paragraph (b)(3) of this section."
   *42 CFR § 440.70*

4. **Key says:** (b)(1) is nursing service
   **Text says:** "(1) Nursing service, as defined in the State Nurse Practice Act, that is provided on a part-time or intermittent basis by a home health agency"
   *42 CFR § 440.70*

5. **Key says:** (b)(2) is home health aide service; (b)(3) is medical supplies, equipment, and appliances
   **Text says:** "(2) Home health aide service provided by a home health agency, (3) Medical supplies, equipment, and appliances suitable for use in any setting in which normal life activities take place"
   *42 CFR § 440.70*

6. **Key says:** (b)(4) is the therapy services
   **Text says:** "(4) Physical therapy, occupational therapy, or speech pathology and audiology services, provided by a home health agency or by a facility licensed by the State to provide medical rehabilitation services."
   *42 CFR § 440.70*

7. **Key says:** What place of residence excludes, and the limited ICF/IID exception
   **Text says:** "A beneficiary's place of residence, for home health services, does not include a hospital, nursing facility, or intermediate care facility for individuals with intellectual disabilities, except for home health services in an intermediate care facility for Individuals with Intellectual Disabilities that are not required to be provided by the facility"
   *42 CFR § 440.70*

8. **Key says:** (c)(1): services may be received in any setting where normal life activities take place, other than the listed facilities or a setting where Medicaid pays or could pay for inpatient room and board; not limited to homebound beneficiaries
   **Text says:** "Nothing in this section should be read to prohibit a beneficiary from receiving home health services in any setting in which normal life activities take place, other than a hospital, nursing facility; intermediate care facility for individuals with intellectual disabilities; or any setting in which payment is or could be made under Medicaid for inpatient services that include room and board. Home health services cannot be limited to services furnished to beneficiaries who are homebound."
   *42 CFR § 440.70*

9. **Key says:** Policy 3A states it was updated to comply with 42 CFR 440.70
   **Text says:** "Home Health Services policy 3A has been updated to comply with the Centers for Medicare & Medicaid Services (CMS) Home Health Final Rule, 42 CFR Part 440.70."
   *Policy 3A (Home Health Services), 5.3.1*

Not checked against the corpus (advice to the reader, not a statement of policy): 'Place of residence' definition may vary — verify current interpretation

<details><summary>Original key and what was wrong with it</summary>

Under 42 CFR 440.70, 'home health services' must be provided at the beneficiary's place of residence and on orders written by a physician, nurse practitioner, clinical nurse specialist, or physician assistant working in accordance with state law, as part of a written plan of care reviewed every 60 days. The federal definition in SSA Section 1905(a) includes this as a mandatory Medicaid benefit. NC implements this through Clinical Coverage Policy 3A (Home Health Services), which defines the state-specific coverage criteria and provider requirements within the federal framework.

- 'The federal definition in SSA Section 1905(a) includes this as a mandatory Medicaid benefit': statute text is not in the corpus, and the validation note says section 1905(a) defines medical assistance without making a service mandatory
- The four-practitioner ordering rule and 60-day review stated for all home health services: 440.70(a)(2) applies them to the services in (b)(1), (2) and (4) only; supplies, equipment and appliances have their own ordering rule in (a)(3)
- 'Policy 3A ... defines the state-specific coverage criteria and provider requirements within the federal framework': not stated in the cited one-line section 3.2.1
- Caveat 'State policy ... cannot be more restrictive for mandatory benefits': not stated in any cited section

</details>

---

## q-018

**Question.** Are there quantity limits on prescription drugs under NC Medicaid, and when is prior authorization required for pharmacy claims?

**Proposed key.** Yes. Under Clinical Coverage Policy 9 (Outpatient Pharmacy), Section 5.4 sets the maximum supply for all drugs at a 34-day supply unless the medication meets one of the listed exceptions. Section 5.4.3 covers quantity and episodic drugs: NC Medicaid may impose quantity limitations for episodic drugs, and for the limits themselves the policy refers to the Preferred Drug List or the specific Prior Authorization policy. Under Section 5.1, Medicaid requires prior authorization for selected prescription drugs. Attachment K (Pharmacy Prior Approval Criteria) introduces the list of prescription drugs that require prior authorization, and the section on Pharmacy Prior Approval Drugs and Criteria lists those drugs and drug classes. The medical necessity criteria for each medication that requires prior approval are published on the NCTracks and NC Medicaid websites rather than in the policy.

**Caveats.** NC Medicaid monitors utilization of designated episodic drugs annually or more often to assess the need for changes in the limits, and the policy refers to the NCTracks website for a list of drugs that require prior authorization; Generic substitution requirements also affect dispensing

**Check each pair: does the policy text say what the key says?**

1. **Key says:** 34-day maximum supply unless an exception applies
   **Text says:** "The maximum supply for all drugs is a 34-day supply unless the medication meets the criteria described below:"
   *Policy 9 (Outpatient Pharmacy Program), 5.4*

2. **Key says:** Quantity limitations for episodic drugs
   **Text says:** "NC Medicaid may impose quantity limitations for episodic drugs based on advice from the North Carolina Physician Advisory Group (NCPAG)"
   *Policy 9 (Outpatient Pharmacy Program), 5.4.3*

3. **Key says:** Where the limits themselves are found
   **Text says:** "For quantity limitations refer to the Preferred Drug List or the specific Prior Authorization policy"
   *Policy 9 (Outpatient Pharmacy Program), 5.4.3*

4. **Key says:** When prior authorization is required
   **Text says:** "Medicaid shall require prior authorization for selected prescription drugs."
   *Policy 9 (Outpatient Pharmacy Program), 5.1*

5. **Key says:** Attachment K introduces the list
   **Text says:** "Below is a list of prescription drugs that require prior authorization (PA)."
   *Policy 9 (Outpatient Pharmacy Program), Attachment K*

6. **Key says:** The section lists drugs and drug classes
   **Text says:** "Aduhelm Agents for Duchenne Muscular Dystrophy Antiemetic Agents"
   *Policy 9 (Outpatient Pharmacy Program), Pharmacy Prior Approval Drugs and Criteria*

7. **Key says:** Criteria are on the NCTracks website; caveat: the policy refers to NCTracks for a list of drugs that require prior authorization
   **Text says:** "Refer to http://nctracks.nc.gov/ for a list of prescription drugs that require prior authorization (PA). The website lists the medical necessity criteria for coverage for each medication that requires prior approval."
   *Policy 9 (Outpatient Pharmacy Program), 5.1*

8. **Key says:** Criteria are on the NC Medicaid website
   **Text says:** "Refer to https://medicaid.ncdhhs.gov/ for the medical necessity criteria for coverage for each medication that requires prior approval."
   *Policy 9 (Outpatient Pharmacy Program), Attachment K*

9. **Key says:** Caveat: limits are reviewed and may change
   **Text says:** "NC Medicaid shall monitor utilization of designated episodic drugs on an annual basis or more frequently, if necessary, in order to assess the need for changes in the limits."
   *Policy 9 (Outpatient Pharmacy Program), 5.4.3*

10. **Key says:** Caveat: generic substitution
   **Text says:** "The General Assembly authorizes and mandates pharmacists participating in Medicaid to substitute generic drugs for brand or trade name drugs unless the prescriber specifically orders the brand name drug."
   *Policy 9 (Outpatient Pharmacy Program), 5.8*

<details><summary>Original key and what was wrong with it</summary>

Yes. Under Clinical Coverage Policy 9 (Outpatient Pharmacy), Section 5.4.3 covers quantity and episodic drug limits. Certain drugs have quantity limits per dispensing to minimize costs while ensuring adequate supply. Prior authorization is required for specific drugs listed in the Pharmacy Prior Approval criteria (Attachment K). Section on Pharmacy Prior Approval Drugs and Criteria details the drugs and conditions that trigger prior approval requirements. The prior approval process is designed to ensure appropriate utilization while maintaining access to medically necessary medications.

- Quantity limits exist 'to minimize costs while ensuring adequate supply' (no such purpose stated)
- The prior approval process 'is designed to ensure appropriate utilization while maintaining access to medically necessary medications' (no such purpose stated)
- The Pharmacy Prior Approval Drugs and Criteria section details the conditions that trigger prior approval (it is a bare list of drug names; criteria are on the websites)
- Caveat: the drug list and quantity limits change 'via bulletins' (the policy does not say how changes are announced)

</details>

---

## q-019

**Question.** Under what conditions can speech therapy be provided via telehealth under NC Medicaid?

**Proposed key.** Under Clinical Coverage Policy 10A, select services may be provided via telehealth, and speech-language pathology services are covered when medically necessary. Section 3.1.1 sets the criteria for a beneficiary to receive telehealth services: informed consent for telehealth delivery must be provided by the beneficiary or their legally authorized representative; telehealth must be safe and effective, with a parent, guardian, or caregiver present if necessary; telehealth delivery must not compromise efficacy of care; in-person care must be made available if the beneficiary requests it; and telehealth must be used in the best interest of the beneficiary, not as a convenience for the therapist, and never solely to increase therapist productivity. Only the speech/language codes marked telehealth eligible in Attachment A qualify. Section 3.1.1 refers to Clinical Coverage Policy 1-H for the requirements for service delivery via telehealth, and therapy must be discontinued when telehealth delivery cannot meet the same standard of care as in-person services.

**Caveats.** Not all therapy codes are eligible for telehealth delivery; Telehealth claims must carry modifier GT and are filed with the provider's usual place of service code

**Check each pair: does the policy text say what the key says?**

1. **Key says:** select services may be provided via telehealth
   **Text says:** "Select services within this clinical coverage policy may be provided via telehealth."
   *Policy 10A (Outpatient Specialized Therapies), 3.1.1*

2. **Key says:** speech-language services covered when medically necessary
   **Text says:** "Medicaid shall cover outpatient speech-language pathology services for a beneficiary when medically necessary."
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.3*

3. **Key says:** informed consent; safe and effective
   **Text says:** "Informed consent for telehealth service delivery must be provided by the beneficiary or their legally authorized representative; Telehealth must be safe and effective, with the beneficiary's parent, guardian, or caregiver present if necessary;"
   *Policy 10A (Outpatient Specialized Therapies), 3.1.1*

4. **Key says:** efficacy; in-person care on request
   **Text says:** "Telehealth delivery does not compromise efficacy of care; In-person care must be made available if requested by the beneficiary;"
   *Policy 10A (Outpatient Specialized Therapies), 3.1.1*

5. **Key says:** best interest, not convenience or productivity
   **Text says:** "Telehealth must be used in the best interest of the beneficiary and not as a convenience for the therapist; and Telehealth must never be used solely to increase therapist productivity."
   *Policy 10A (Outpatient Specialized Therapies), 3.1.1*

6. **Key says:** eligible codes are in Attachment A
   **Text says:** "Note: CPT codes applicable to OST telehealth service delivery are indicated in Attachment A, Section C: Codes."
   *Policy 10A (Outpatient Specialized Therapies), 3.1.1*

7. **Key says:** evaluation code 92521 is telehealth eligible
   **Text says:** "| 92521 | (1 unit = 1 event) | Yes |"
   *Policy 10A (Outpatient Specialized Therapies), Speech/Language Evaluation*

8. **Key says:** treatment code 92507 eligible, 92508 not; caveat that not all codes are eligible
   **Text says:** "| 92507 | (1 unit = 1 event) | Yes | | 92508 | (1 unit = 1 event) | No |"
   *Policy 10A (Outpatient Specialized Therapies), Speech/Language Treatment*

9. **Key says:** discharge criterion on standard of care
   **Text says:** "telehealth service delivery cannot meet the same standard of care as in-person services"
   *Policy 10A (Outpatient Specialized Therapies), a. Discharge*

10. **Key says:** delivery requirements are in Policy 1-H
   **Text says:** "Refer to Clinical Coverage Policy, 1-H, Telehealth, Virtual Communications, and Remote Patient Monitoring, for requirements for service delivery via telehealth"
   *Policy 10A (Outpatient Specialized Therapies), 3.1.1*

11. **Key says:** caveat: modifier GT
   **Text says:** "Modifier GT must be appended to the CPT or HCPCS code to indicate that a service has been provided via interactive audio-visual communication."
   *Policy 10A (Outpatient Specialized Therapies), Unlisted Procedure or Service*

12. **Key says:** caveat: usual place of service code
   **Text says:** "Telehealth claims should be filed with the provider's usual place of service code(s)."
   *Policy 10A (Outpatient Specialized Therapies), F. Place of Service*

<details><summary>Original key and what was wrong with it</summary>

Under Clinical Coverage Policy 10A, speech and language evaluation and treatment may be provided via telehealth when it is medically necessary and the beneficiary resides in a remote or underserved area where in-person services are not reasonably available. The telehealth delivery must meet the same clinical standards as in-person services, and the provider must document why telehealth is appropriate for the specific beneficiary's needs.

- Telehealth requires that the beneficiary reside in a remote or underserved area where in-person services are not reasonably available (no such condition anywhere in Policy 10A)
- The provider must document why telehealth is appropriate for the specific beneficiary (no such requirement in Policy 10A)
- Caveat: telehealth policies expanded during COVID-19 (Policy 10A does not mention COVID-19)
- Caveat: billing codes for telehealth may differ from in-person (the policy uses the same codes with modifier GT and the usual place of service code)

</details>

---

## q-020

**Question.** The Non-Emergency Medical Transportation (NEMT) policy has been amended multiple times. Which change notice is the most recent, and what did it change?

**Proposed key.** In the current DHHS corpus, the latest identifiable NEMT revision is Change No. 04-26, dated March 16, 2026. The corpus holds a 04-26 change notice for each manual, one for the Family and Children's Medicaid manual (MA-3550) and one for the Aged, Blind, and Disabled Medicaid manual (MA-2910). Both notices say the same thing: NC Medicaid updated the charts in the NEMT section for In-State and Out-of-State Per Diem Rates and Mileage Rates. The change is effective upon receipt for all applications processing and ongoing recertifications. The notices name the charts that changed but do not give the old or new rate amounts.

**Caveats.** NEMT exists in both MA-3550 and MA-2910 manual variants in the corpus; The 04-26 change notices do not list the rate amounts, so use the rate charts in the manual or the source notice PDF if you need the exact figures

**Check each pair: does the policy text say what the key says?**

1. **Key says:** change number, date, and the Family and Children's manual
   **Text says:** "DATE: March 16, 2026 Manual: Family and Children's Medicaid Change No: 04-26"
   *CHANGE NOTICE FOR MANUAL NO. 04-26, Non-Emergency Medical Transportation (NEMT), CHANGE NOTICE FOR MANUAL NO. 04-26, NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)*

2. **Key says:** companion notice for the Aged, Blind, and Disabled manual
   **Text says:** "DATE: March 16, 2026 Manual: Aged, Blind, and Disabled Medicaid Change No: 04-26"
   *CHANGE NOTICE FOR MANUAL NO. 04-26, Non-Emergency Medical Transportation (NEMT), CHANGE NOTICE FOR MANUAL NO. 04-26, NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)*

3. **Key says:** MA-2910 manual header
   **Text says:** "REVISED 03/16/2026 -CHANGE NO. 04-26"
   *MA-2910 – NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT), NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT)*

4. **Key says:** what the change did (MA-3550); also shows the MA-3550 variant
   **Text says:** "has updated the charts in MA-3550, NonEmergency Medical Transportation (NEMT) for In-State and Out-of-State Per Diem Rates and Mileage Rates."
   *CHANGE NOTICE FOR MANUAL NO. 04-26, Non-Emergency Medical Transportation (NEMT), I. BACKGROUND AND CONTENT OF CHANGE*

5. **Key says:** what the change did (MA-2910); also shows the MA-2910 variant
   **Text says:** "has updated the charts in MA-2910, NonEmergency Medical Transportation (NEMT) for In-State and Out-of-State Per Diem Rates and Mileage Rates."
   *CHANGE NOTICE FOR MANUAL NO. 04-26, Non-Emergency Medical Transportation (NEMT), I. BACKGROUND AND CONTENT OF CHANGE*

6. **Key says:** effective date
   **Text says:** "This change notice is effective upon receipt for all applications processing and ongoing recertifications."
   *CHANGE NOTICE FOR MANUAL NO. 04-26, Non-Emergency Medical Transportation (NEMT), II. EFFECTIVE DATE AND IMPLEMENTATION*

Not checked against the corpus (advice to the reader, not a statement of policy): use the rate charts in the manual or the source notice PDF if you need the exact figures

<details><summary>Original key and what was wrong with it</summary>

In the current DHHS corpus, the latest identifiable NEMT revision is Change No. 04-26, reflected in the MA-3550 manual header 'REVISED 03/16/2026 - CHANGE NO. 04-26.' The companion 04-26 change notice document is present, but its parsed body is title-only in the current graph, so the corpus does not expose a reliable section-level summary of the substantive edits. The retrievable conclusion is therefore that Change No. 04-26 is the most recent visible NEMT amendment, while the exact detailed changes require checking the source notice PDF.

- The 04-26 change notice's parsed body is title-only (contradicted: both 04-26 notices have body text stating what changed)
- The corpus does not expose a summary of the substantive edits (contradicted by the notices' 'Background and Content of Change' sections)
- The header is quoted from MA-3550 section text (in MA-3550 the header survives only as the title of an empty section; the cited section _s2 is also empty)

</details>

---

## q-023

**Question.** Until what age should physicians provide fluoride varnish applications for Medicaid beneficiaries, and what oral screening requirements apply?

**Proposed key.** Under Clinical Coverage Policy 1A-23 (Physician Fluoride Varnish Services), Section 7.2 specifies oral screening requirements. Physicians should provide fluoride varnish applications and oral screening as preventive procedures for young children. The screening includes early caries screening and detection of notable findings in the oral cavity using a dental mirror and directed light, counseling on good oral hygiene practices and nutrition, and prescribing a fluoride supplement if indicated. Fluoride varnish is applied to all erupted primary teeth, beginning at tooth eruption until the beneficiary is 3½ years of age. Providers shall refer the beneficiary to a dentist for continued treatment at the appropriate age based on the beneficiary's need for dental services.

**Caveats.** This covers physician fluoride varnish services, which the policy defines as preventive procedures provided by or under the supervision of a physician; EPSDT may extend preventive dental services beyond standard age limits

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Screening includes early caries screening and detection of notable findings using a dental mirror and directed light
   **Text says:** "Early caries screening and detection of notable findings (obvious pathology of hard and soft tissues) in the oral cavity using a dental mirror and directed light."
   *Policy 1A-23 (Physician Fluoride Varnish Services), 7.2*

2. **Key says:** Counseling on good oral hygiene practices and nutrition
   **Text says:** "Counseling and educational materials on good oral hygiene practices and nutrition for children."
   *Policy 1A-23 (Physician Fluoride Varnish Services), 7.2*

3. **Key says:** Prescribing a fluoride supplement if indicated
   **Text says:** "Prescribing a fluoride supplement, if indicated"
   *Policy 1A-23 (Physician Fluoride Varnish Services), 7.2*

4. **Key says:** Fluoride varnish is applied from tooth eruption until the beneficiary is 3½ years of age
   **Text says:** "Application of the fluoride varnish to all erupted primary teeth, beginning at tooth eruption until the beneficiary is 3½ years of age."
   *Policy 1A-23 (Physician Fluoride Varnish Services), 7.2*

5. **Key says:** Referral to a dentist at the appropriate age based on need
   **Text says:** "Providers shall refer the beneficiary to a dentist for continued treatment at the appropriate age based on the beneficiary's need for dental services."
   *Policy 1A-23 (Physician Fluoride Varnish Services), 7.2*

6. **Key says:** Age limit of 3½ years, confirmed in the coverage section
   **Text says:** "from the time of tooth eruption until the child is 3½ years of age"
   *Policy 1A-23 (Physician Fluoride Varnish Services), 3.2.2*

7. **Key says:** Services are preventive procedures provided by or under the supervision of a physician (answer and first caveat)
   **Text says:** "Physician fluoride varnish services are defined as preventive procedures provided by or under the supervision of a physician."
   *Policy 1A-23 (Physician Fluoride Varnish Services), 1.0*

8. **Key says:** The service is for young children
   **Text says:** "Fluoride varnish is practical, safe, and easy to apply to the teeth of infants and very young children"
   *Policy 1A-23 (Physician Fluoride Varnish Services), 7.3*

9. **Key says:** Second caveat: services outside the limitations need special approval, available for medically necessary services for a beneficiary under age 21
   **Text says:** "Claims for services that fall outside these limitations will be denied unless special approval is granted for services deemed medically necessary for a Medicaid beneficiary under age 21."
   *Policy 1A-23 (Physician Fluoride Varnish Services), 5.3*

10. **Key says:** Second caveat: EPSDT may allow services beyond the policy's limits for beneficiaries under 21
   **Text says:** "Service limitations on scope, amount, duration, frequency, location of service, and other specific criteria described in clinical coverage policies may be exceeded or may not apply as long as the provider's documentation shows that the requested service is medically necessary"
   *Policy 1A-23 (Physician Fluoride Varnish Services), a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]*

<details><summary>Original key and what was wrong with it</summary>

Under Clinical Coverage Policy 1A-23 (Physician Fluoride Varnish Services), Section 7.2 specifies oral screening requirements. Physicians should provide fluoride varnish applications and oral screening as part of preventive care for young children. The screening includes early caries detection and assessment of risk factors. Fluoride varnish is indicated from the eruption of the first tooth until age 3½ years, at which point the child should transition to dental care.

- The screening includes 'assessment of risk factors' (not in Section 7.2)
- At age 3½ 'the child should transition to dental care' (Section 7.2 says referral to a dentist is at the appropriate age based on the beneficiary's need, not at 3½)
- Caveat: 'dental providers have separate billing' (the policy does not say this)

</details>

---

## q-024

**Question.** Can an NC Innovations waiver participant request services that exceed their individual base budget, and what happens if they believe their needs cannot be met within the budget?

**Proposed key.** Yes. Under Clinical Coverage Policy 8P (NC Innovations), a participant may request services that cost in excess of their base budget if they believe their needs cannot be met within the base budget. The policy states that the results of the Supports Intensity Scale (SIS) assessment and the base budget are guidelines that do not constitute a binding limit on the amount of services that may be requested or authorized. If the LME/MCO determines the requested services to be medically necessary, they will be authorized regardless of the base budget. If a request for authorization is denied, the LME/MCO notifies the individual of the reasons for the decision and how to appeal.

**Caveats.** Services above the base budget remain subject to the waiver's $135,000 cost limit, which may be exceeded only when the policy's criteria are met

**Check each pair: does the policy text say what the key says?**

1. **Key says:** A participant may request services costing more than the base budget if they believe their needs cannot be met within it
   **Text says:** "He or she may request services that cost in excess of his or her base budget if he or she believes his or her needs cannot be met within his or her base budget"
   *Policy 8P (North Carolina Innovations), Category Assignment and Individual Budget Changes*

2. **Key says:** The same rule stated generally, outside the budget-decrease letter context of the first quote
   **Text says:** "Services should be requested and approved if they are medically necessary regardless of the amount of the individual budget."
   *Policy 8P (North Carolina Innovations), Attachment F*

3. **Key says:** SIS results and base budget are guidelines, not a binding limit; medically necessary services are authorized regardless of the base budget
   **Text says:** "The results of the SIS and the base budget are guidelines that do not constitute a binding limit on the amount of services that may be requested or authorized, and if the LME/MCO determines services to be medically necessary, they will be authorized, regardless of the base budget."
   *Policy 8P (North Carolina Innovations), Category Assignment and Individual Budget Changes*

4. **Key says:** On denial, the LME/MCO notifies the individual of the reasons and how to appeal
   **Text says:** "If any request for authorization of services is denied, the LME/MCO will notify the individual of the reasons for the decision and how to appeal"
   *Policy 8P (North Carolina Innovations), Category Assignment and Individual Budget Changes*

5. **Key says:** The SIS is the Supports Intensity Scale, an assessment of support needs
   **Text says:** "This can contain information from the Supports Intensity Scale (SIS), health/support assessment and other formal assessment of the beneficiary's support needs."
   *Policy 8P (North Carolina Innovations), c.*

6. **Key says:** Caveat: $135,000 waiver cost limit on combined services, exceedable only if the policy's criteria are met
   **Text says:** "Combined these services may not total more than the $135,000 cost limit within the waiver unless the follow criteria is met"
   *Policy 8P (North Carolina Innovations), Components of the Individual Budgeting Tool*

<details><summary>Original key and what was wrong with it</summary>

Yes. Under Clinical Coverage Policy 8P (NC Innovations), a participant may request services that cost in excess of their base budget if they believe their needs cannot be met within the base budget. The policy states that the results of the Supports Intensity Scale (SIS) assessment and the base budget are guidelines that do not constitute a binding limit on services. However, the process for obtaining additional funding involves demonstrating that the participant's needs require services beyond what the base budget supports, which may involve additional assessment and authorization from the LME/MCO.

- Exceeding the base budget 'may involve additional assessment' (no section says this)
- The process 'involves demonstrating that the participant's needs require services beyond what the base budget supports' (the policy's test is whether the LME/MCO finds the services medically necessary; Attachment F adds that no beneficiary may be required to show more need than others in the same budget category)
- Caveat: 'LME/MCO discretion plays a significant role in budget exception decisions' (the policy says medically necessary services 'will be authorized, regardless of the base budget')
- Caveat: the distinction is 'legally significant but practically ambiguous' (an opinion with no corpus support)
- Caveat: the process 'is not clearly defined in a single policy section' (a judgment about the document, not something a section states)

</details>

---

## q-026

**Question.** Is chiropractic care covered under Policy 5B (Orthotics and Prosthetics)?

**Proposed key.** No. Policy 5B (Orthotics and Prosthetics) governs devices, not chiropractic services. Per the policy's description in section 1.0 and its specific coverage criteria in section 3.2.1, what the policy covers is orthotic and prosthetic devices that are ordered by a physician, physician assistant, or nurse practitioner and are medically necessary. The policy does not mention chiropractic care at all: section 4.2.1 lists only devices and supplies that are not covered and does not name chiropractic services, so they are not a listed exclusion but simply fall outside what the policy addresses. Chiropractic coverage is governed by a different clinical coverage policy, 1F (Chiropractic Services).

**Caveats.** Policy 5B is silent on chiropractic care; the answer rests on the policy's own scope (sections 1.0 and 3.2.1) and its specific not-covered list (section 4.2.1), not on a stated chiropractic exclusion

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy 5B's subject is orthotic and prosthetic devices, covered when prescribed and medically necessary
   **Text says:** "Orthotic and prosthetic devices are covered by NC Medicaid (Medicaid) when they are prescribed by the beneficiary's treating physician, physician's assistant, or nurse practitioner and medical necessity is documented."
   *Policy 5B (Orthotics & Prosthetics), 1.0*

2. **Key says:** Specific coverage criteria concern orthotics and prosthetics that are ordered and medically necessary
   **Text says:** "Medicaid shall cover orthotics and prosthetics when the beneficiary meets all the following specific criteria: they are ordered by a physician, physician assistant, or nurse practitioner; they are medically necessary"
   *Policy 5B (Orthotics & Prosthetics), 3.2.1*

3. **Key says:** The specific not-covered section lists devices and supplies; chiropractic services are not among them
   **Text says:** "Medicaid shall not cover the following devices and supplies: Devices for the beneficiary's comfort or convenience or for the convenience of the beneficiary's caregiver(s)"
   *Policy 5B (Orthotics & Prosthetics), 4.2.1*

4. **Key says:** Chiropractic coverage is governed by a different clinical coverage policy (1F, Chiropractic Services)
   **Text says:** "Medicaid shall cover chiropractic services when the beneficiary meets the following specific criteria"
   *Policy 1F (Chiropractic Services), 3.2.1*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 5B (Orthotics and Prosthetics) governs devices, not chiropractic services. Per the policy's description/scope section 2.1.1, the policy's scope is orthotic and prosthetic devices that meet medical-necessity criteria; chiropractic services are outside that scope and are not addressed by the not-covered section 4.1 exclusions because they never fall within the policy's coverage at all. Chiropractic coverage, when it exists, is governed by a different clinical coverage policy.

- Section 2.1.1 is the policy's 'description/scope section' and states that the scope is orthotic and prosthetic devices (2.1.1 is generic eligibility text about enrollment in NC Medicaid; the description is in 1.0)
- Section 4.1 anchors the negative answer (4.1 is the generic not-covered rule and says nothing about devices or chiropractic services)
- Caveat instructing a citation of 2.1.1 and 4.1 (those sections do not support the answer)

</details>

---

## q-028

**Question.** Is acupuncture a covered service under Clinical Coverage Policy 8C (Outpatient Behavioral Health)?

**Proposed key.** No. Policy 8C governs outpatient behavioral health services, which section 1.0 describes as psychiatric and comprehensive clinical assessment, medication management, individual, group, and family therapies, psychotherapy for crisis, and psychological testing. Acupuncture is not among those services, and Policy 8C does not mention acupuncture at all. Policy 8C does not say whether acupuncture is covered under any other policy.

**Caveats.** For beneficiaries under 21, the policy's EPSDT provision requires coverage of a service that is medically necessary health care to correct or ameliorate a condition identified through a screening examination, but does not require any service that is unsafe, ineffective, experimental or investigational, not medical in nature, or not generally recognized as an accepted method of medical practice or treatment

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy 8C governs outpatient behavioral health services, which are the listed assessment, medication management, therapy, crisis and testing services; acupuncture is not among them
   **Text says:** "Outpatient behavioral health services are psychiatric and comprehensive clinical assessment, medication management, individual, group, and family therapies, psychotherapy for crisis, and psychological testing for eligible beneficiaries."
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), 1.0*

2. **Key says:** Caveat: what the EPSDT provision requires for beneficiaries under 21
   **Text says:** "requires the state Medicaid agency to cover services, products, or procedures for Medicaid beneficiary under 21 years of age if the service is medically necessary health care to correct or ameliorate a defect, physical or mental illness, or a condition [health problem] identified through a screening examination"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]*

3. **Key says:** Caveat: the carve-out in the same provision
   **Text says:** "EPSDT does not require the state Medicaid agency to provide any service, product or procedure: that is unsafe, ineffective, or experimental or investigational. that is not medical in nature or not generally recognized as an accepted method of medical practice or treatment."
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), a. 42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act]*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 8C governs outpatient behavioral health services (section 2.1.1 scope). Acupuncture is not a behavioral health service and falls outside 8C's scope; section 4.1 confirms acupuncture is not among the covered behavioral health modalities. Any acupuncture coverage would be governed by a different clinical policy, not 8C.

- Section 2.1.1 is Policy 8C's scope (2.1.1 is generic eligibility text about enrollment in NC Medicaid; the description is in 1.0)
- Section 4.1 confirms acupuncture is not among the covered behavioral health modalities (4.1 is the generic not-covered rule and mentions neither acupuncture nor behavioral health modalities)
- Any acupuncture coverage would be governed by a different clinical policy (Policy 8C does not say this)
- The EPSDT caveat had no cited section or quote, and as worded it left out the provision's own carve-out

</details>

---

## q-029

**Question.** Does Policy 10A cover routine massage therapy for beneficiaries over age 21?

**Proposed key.** Policy 10A (Outpatient Specialized Therapies) does not mention massage therapy by name. It covers medically necessary skilled healthcare provided by a qualified therapist in physical therapy, occupational therapy, speech-language pathology and audiology therapy, so routine massage that is not such therapy is not covered under Policy 10A for a beneficiary over 21. EPSDT may permit coverage for beneficiaries under 21 when medically necessary.

**Caveats.** EPSDT exception may apply under 21

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy 10A covers medically necessary skilled healthcare provided by a qualified therapist
   **Text says:** "Outpatient Specialized Therapy (OST) Services are medically necessary skilled healthcare, provided by a qualified therapist, that supports a beneficiary's functional skills for daily living."
   *Policy 10A (Outpatient Specialized Therapies), 1.0*

2. **Key says:** The services are evaluations and treatments in physical therapy, occupational therapy, speech-language pathology and audiology therapy
   **Text says:** "The services consist of evaluations, re-evaluations, multidisciplinary evaluations, and treatments for the following: Physical Therapy; Occupational Therapy; Speech-Language Pathology; and Audiology Therapy."
   *Policy 10A (Outpatient Specialized Therapies), 1.0*

3. **Key says:** Physical therapy is covered when medically necessary
   **Text says:** "Medicaid shall cover outpatient physical therapy services for a beneficiary when medically necessary."
   *Policy 10A (Outpatient Specialized Therapies), 3.2.1.1*

4. **Key says:** EPSDT may permit coverage for beneficiaries under 21 when medically necessary (answer and caveat)
   **Text says:** "requires the state Medicaid agency to cover services, products, or procedures for Medicaid beneficiary under 21 years of age if the service is medically necessary health care to correct or ameliorate a defect, physical or mental illness, or a condition"
   *Policy 10A (Outpatient Specialized Therapies), 2.2.1*

5. **Key says:** a service that does not meet the section 3.0 coverage criteria is not covered (the conclusion that routine massage that is not such therapy is not covered under Policy 10A)
   **Text says:** "Medicaid shall not cover procedures, products, and services related to this policy when: the beneficiary does not meet the eligibility requirements listed in Section 2.0; the beneficiary does not meet the criteria listed in Section 3.0"
   *Policy 10A (Outpatient Specialized Therapies), 4.1*

<details><summary>Original key and what was wrong with it</summary>

No. Routine massage therapy is not covered under Policy 10A (Outpatient Therapy) for beneficiaries age 21 and older. The policy's scope section defines covered outpatient therapy services, and routine massage falls outside that scope. EPSDT may permit coverage for beneficiaries under 21 when medically necessary.

- Routine massage therapy is not covered under Policy 10A, stated as a flat rule (the policy never mentions massage; no section states a massage exclusion)
- The policy's 'scope section' 2.1.1 defines covered outpatient therapy services (2.1.1 is generic eligibility text; the description is in 1.0)
- Section 4.1 as the basis for the exclusion (4.1 is the generic not-covered rule and says nothing about massage)
- Policy title 'Outpatient Therapy' (the document is 'Outpatient Specialized Therapies')

</details>

---

## q-030

**Question.** Are experimental or investigational drugs covered under the NC Medicaid outpatient pharmacy benefit?

**Proposed key.** No. Experimental and investigational drugs are excluded from the NC Medicaid outpatient pharmacy benefit. The governing pharmacy policy (Clinical Coverage Policy 9) lists a product that is experimental, investigational, or part of a clinical trial among its general not-covered criteria (section 4.1).

**Caveats.** FDA-approved drugs may still require prior authorization

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Section 4.1 is the policy's general not-covered rule
   **Text says:** "Medicaid shall not cover the procedure, product, or service related to this policy when the:"
   *Policy 9 (Outpatient Pharmacy Program), 4.1*

2. **Key says:** Experimental and investigational drugs are excluded; the policy lists experimental, investigational or clinical-trial products among its general not-covered criteria
   **Text says:** "the procedure, product, or service is experimental, investigational, or part of a clinical trial."
   *Policy 9 (Outpatient Pharmacy Program), 4.1*

3. **Key says:** Caveat: drugs may still require prior authorization
   **Text says:** "Medicaid shall require prior authorization for selected prescription drugs."
   *Policy 9 (Outpatient Pharmacy Program), 5.1*

4. **Key says:** Caveat: coverage based on FDA indications can still involve prior approval
   **Text says:** "shall be based on FDA indications, FDA approved dosages, and medically acceptable indications, and can involve prior approval"
   *Policy 9 (Outpatient Pharmacy Program), 5.1*

<details><summary>Original key and what was wrong with it</summary>

No. Experimental and investigational drugs — including those not approved by the FDA for the indication being treated — are excluded from the NC Medicaid outpatient pharmacy benefit. The governing pharmacy policy lists experimental treatments among general exclusions.

- Experimental and investigational drugs include 'those not approved by the FDA for the indication being treated' (not in section 4.1; section 3.2.1 instead requires an FDA approved indication or a medically accepted indication unless approval is given by DHB, and section 3.2.3 has a request process for use outside FDA approved guidelines, so the policy does not equate the two)
- The prior-authorization caveat had no cited section or quote

</details>

---

## q-031

**Question.** Does Policy 1A-2 (Preventive Medicine Annual Health Assessment) cover gym memberships or wellness club fees as part of preventive care?

**Proposed key.** No. Policy 1A-2 covers the adult annual health assessment (described in section 1.0), not lifestyle or fitness memberships. The policy does not mention gym memberships or wellness-club fees; its own not-covered criteria (section 4.2.2) concern only when the assessment itself is not covered. Gym memberships and general wellness-club fees are therefore not a covered benefit under Policy 1A-2.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** What the annual health assessment covered by Policy 1A-2 consists of
   **Text says:** "An adult preventive medicine health assessment consists of a comprehensive unclothed physical examination, comprehensive health history, anticipatory guidance/risk factor reduction interventions, and the ordering of gender- and age-appropriate laboratory and diagnostic procedures."
   *Policy 1A-2 (Preventive Medicine Annual Health Assessment), 1.0*

2. **Key says:** Policy 1A-2 covers the adult annual health assessment
   **Text says:** "Medicaid shall cover adult annual health assessment once per 365 days for Medicaid beneficiaries 21 years of age and older."
   *Policy 1A-2 (Preventive Medicine Annual Health Assessment), 3.2.2*

3. **Key says:** The policy's not-covered criteria concern when the assessment itself is not covered
   **Text says:** "The adult annual health assessment is not covered when the medical criteria listed in Section 3.0 are not met."
   *Policy 1A-2 (Preventive Medicine Annual Health Assessment), 4.2.2*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 1A-2 covers the clinician-performed annual health assessment (scope section 2.1.1), not lifestyle or fitness memberships. Gym memberships and general wellness-club fees are not a covered Medicaid benefit under Policy 1A-2 and are confirmed as not-covered in section 4.1.

- Section 2.1.1 is the policy's scope section (it is generic eligibility text; the description is in 1.0)
- Gym memberships and wellness-club fees are 'confirmed as not-covered in section 4.1' (4.1 is the generic not-covered rule and does not mention them; no section of the policy does)
- The assessment is 'clinician-performed' (the word does not appear in the policy)

</details>

---

## q-032

**Question.** Does Policy 9 (Outpatient Pharmacy) cover over-the-counter fertility or hormone supplements purchased without a prescription?

**Proposed key.** No. Policy 9 applies to covered legend drugs and covered OTC products dispensed by outpatient pharmacy providers (section 1.0). Its specific coverage criteria (section 3.2.1) cover prescribed drugs, and cover selected OTC products when they meet the criteria in Clinical Coverage Policy 9A, Over-The-Counter Products. Section 4.2.1 lists OTC products (other than those selected under section 3.2.1) and fertility drugs among the items Medicaid shall not cover. Policy 9 itself therefore gives no coverage for OTC fertility or hormone supplements purchased without a prescription.

**Caveats.** Selected OTC products, including insulin, are covered when they meet the criteria in Policy 9A; prenatal vitamins and fluoride are also on Policy 9's covered list

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy 9's scope: covered legend drugs and covered OTC products dispensed by outpatient pharmacy providers
   **Text says:** "The following policy applies to NC Medicaid (Medicaid) covered legend drugs and covered over the counter (OTC) products dispensed by outpatient pharmacy providers."
   *Policy 9 (Outpatient Pharmacy Program), 1.0*

2. **Key says:** The specific coverage criteria cover prescribed drugs
   **Text says:** "The Medicaid Outpatient Pharmacy Programs shall cover prescribed drugs when they meet all the following guidelines and specific criteria listed in this policy"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

3. **Key says:** The coverage criteria assume a prescription; nothing covers a purchase without one
   **Text says:** "The prescription must be written for whom the claim is billed"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

4. **Key says:** Selected OTC products are covered when they meet Policy 9A's criteria (answer and caveat)
   **Text says:** "Selected OTC products including insulin are covered when they meet the criteria listed in clinical coverage policy 9A, Over the Counter Products"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

5. **Key says:** OTC products, other than those selected under section 3.2.1, are not covered
   **Text says:** "Medicaid shall not cover the following: OTC products. Refer to Subsection 3.2.1(b)"
   *Policy 9 (Outpatient Pharmacy Program), 4.2.1*

6. **Key says:** Fertility drugs are on the not-covered list
   **Text says:** "Fertility drugs;"
   *Policy 9 (Outpatient Pharmacy Program), 4.2.1*

7. **Key says:** Caveat: prenatal vitamins and fluoride are on Policy 9's covered list
   **Text says:** "Prenatal vitamins and fluoride;"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 9's pharmacy benefit scope (section 2.1.1) requires a prescription from an enrolled prescriber and limits OTC coverage to drugs on the state's approved OTC list. Self-purchased OTC fertility or hormone supplements without a prescription are not reimbursable under the pharmacy benefit, and section 4.1 confirms non-prescription retail items are not covered.

- Section 2.1.1 is Policy 9's pharmacy benefit scope and requires a prescription and sets OTC list rules (2.1.1 is generic eligibility text; the description is in 1.0 and the criteria in 3.2.1)
- A prescription 'from an enrolled prescriber' is required (no such wording in the policy's coverage criteria)
- OTC coverage is limited to 'drugs on the state's approved OTC list' (Policy 9 says only that selected OTC products are covered when they meet the criteria in Policy 9A)
- Section 4.1 confirms non-prescription retail items are not covered (4.1 is the generic not-covered rule and says nothing about prescriptions, OTC or retail items; the OTC and fertility exclusions are in 4.2.1)
- Prenatal vitamins as an example of a covered OTC (section 3.2.1 lists prenatal vitamins and fluoride as covered but does not describe them as OTC; the OTC example it gives is insulin)

</details>

---

## q-034

**Question.** Does the NC Medicaid dental benefit cover cosmetic teeth whitening for adults?

**Proposed key.** No. Cosmetic teeth whitening is not a covered service under the NC Medicaid dental benefit for adults. Clinical Coverage Policy 4A (Dental Services) states that Medicaid shall not cover cosmetic procedures, and that only the procedure codes listed in the policy are covered. The benefit covers medically necessary dental care (e.g., extractions and restorations, within the policy's limitations); purely cosmetic procedures are excluded, and the policy also says resin-based composite restorations are not covered for treatment of cosmetic problems such as discolored teeth.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Cosmetic procedures, and so cosmetic whitening, are not covered
   **Text says:** "Medicaid shall not cover the following: cosmetic procedures;"
   *Policy 4A (Dental Services), 4.2.1*

2. **Key says:** Only procedure codes listed in the policy are covered
   **Text says:** "Only the procedure codes listed in this policy are covered under the North Carolina (NC) Medicaid (Title XIX) Dental Program."
   *Policy 4A (Dental Services), 1.0*

3. **Key says:** Covered care is subject to the policy's limitations
   **Text says:** "with the limitations and exclusions specified in this policy"
   *Policy 4A (Dental Services), 1.0*

4. **Key says:** Composite restorations are not covered for cosmetic problems such as discolored teeth
   **Text says:** "are not covered for treatment of cosmetic problems (such as diastemas, discolored teeth, developmental anomalies)"
   *Policy 4A (Dental Services), 5.3.4.2*

5. **Key says:** The benefit covers medically necessary dental care
   **Text says:** "Medicaid shall cover the procedure, product, or service related to this policy when medically necessary"
   *Policy 4A (Dental Services), 3.1*

6. **Key says:** Extractions are covered dental care
   **Text says:** "Payment for an extraction includes local anesthesia, any necessary sutures, and routine postoperative care."
   *Policy 4A (Dental Services), 5.3.11.1*

7. **Key says:** Restorations are covered dental care
   **Text says:** "Payment for the restoration includes local anesthesia, and any necessary liners, bases, and pulp caps."
   *Policy 4A (Dental Services), 5.3.4*

<details><summary>Original key and what was wrong with it</summary>

No. Cosmetic teeth whitening is not a covered service under the NC Medicaid adult dental benefit. The benefit covers medically necessary dental care (e.g., extractions, restorations, oral surgery under defined criteria); purely cosmetic procedures are excluded.

- Nothing the original cited (generic section 4.1) mentions cosmetic procedures, whitening or what the dental benefit covers; the conclusion is right but was attributed to the wrong section.

</details>

---

## q-035

**Question.** Under Policy 5A-2 (Respiratory Equipment and Supplies), can an adult beneficiary get a replacement CPAP machine every year?

**Proposed key.** No. Annual replacement of a CPAP machine is not a benefit under Policy 5A-2. Attachment A, Section C of the policy lists a lifetime expectancy of 5 years for the CPAP device (HCPCS E0601). Under section 5.9, Medicaid may consider replacing an item when repairing it is no longer cost-effective and the item is out of warranty, and a prior approval request to replace an item before its usual life expectancy has ended must explain on the CMN/PA form why the replacement is needed. Under section 5.5, equipment ordered beyond the policy's limits needs prior approval, and a request to override a lifetime expectancy must include an explanation of the medical necessity for the override.

**Caveats.** EPSDT may permit earlier replacement for beneficiaries under 21 when medically necessary

**Check each pair: does the policy text say what the key says?**

1. **Key says:** CPAP device (E0601) has a lifetime expectancy of 5 years, so annual replacement is not the benefit
   **Text says:** "| E0601 | Continuous airway pressure (CPAP) device | 5 years |"
   *Policy 5A-2 (Respiratory Equipment and Supplies), Lifetime Expectancies and Quantity Limitations for Durable Medical Equipment and Supplies*

2. **Key says:** The table of lifetime expectancies is Attachment A, Section C of the policy
   **Text says:** "Refer to Attachment A, Section C: Procedure Code(s) for a listing of the established lifetime expectancies and quantity limitations for Durable Medical Equipment and Supplies."
   *Policy 5A-2 (Respiratory Equipment and Supplies), 5.5*

3. **Key says:** When Medicaid may consider replacing an item
   **Text says:** "Medicaid may consider replacing the item, when repairing is no longer cost-effective and the item is out of warranty"
   *Policy 5A-2 (Respiratory Equipment and Supplies), 5.9*

4. **Key says:** Early replacement needs prior approval with an explanation on the CMN/PA form
   **Text says:** "When requesting prior approval for the replacement of an item before its usual life expectancy has ended, explain on the CMN/PA form why the replacement is needed."
   *Policy 5A-2 (Respiratory Equipment and Supplies), 5.9*

5. **Key says:** Equipment beyond the limits needs prior approval
   **Text says:** "orders equipment or supplies beyond these limits, the DME provider shall seek prior approval for these items through NCTracks"
   *Policy 5A-2 (Respiratory Equipment and Supplies), 5.5*

6. **Key says:** A lifetime expectancy can be overridden only by a prior approval request
   **Text says:** "A PA request for an override of a quantity limit, or lifetime expectancy must include the usual PA documentation"
   *Policy 5A-2 (Respiratory Equipment and Supplies), 5.5*

7. **Key says:** The override request must explain medical necessity
   **Text says:** "An explanation of the medical necessity for the override from the physician, physician assistant, nurse practitioner, or therapist."
   *Policy 5A-2 (Respiratory Equipment and Supplies), 5.5*

8. **Key says:** Caveat: EPSDT may permit earlier replacement for beneficiaries under 21
   **Text says:** "Service limitations on scope, amount, duration, frequency, location of service, and other specific criteria described in clinical coverage policies may be exceeded or may not apply as long as the provider's documentation shows that the requested service is medically necessary"
   *Policy 5A-2 (Respiratory Equipment and Supplies), 2.2.1*

9. **Key says:** Caveat: EPSDT applies to beneficiaries under 21
   **Text says:** "for Medicaid beneficiary under 21 years of age"
   *Policy 5A-2 (Respiratory Equipment and Supplies), 2.2.1*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 5A-2 sets coverage criteria (section 3.2.1) that include frequency-of-replacement limits for durable respiratory equipment. Annual replacement is not a benefit; replacement is authorized only after a defined minimum useful-life interval or when medically necessary due to documented device failure not repairable under warranty. Section 4.2.1 lists specific items and conditions that are not covered when the frequency or medical-necessity requirement is not met.

- Section 3.2.1 includes frequency-of-replacement limits: it does not; it covers ordering, medical necessity, the face-to-face encounter and annual review of need.
- Section 4.2.1 lists items not covered when the frequency requirement is not met: it does not; it lists convenience items, backups and duplicates, inpatient settings, items covered by another agency and hospice diagnoses.
- Replacement only for 'documented device failure not repairable under warranty': the policy's wording is that Medicaid may consider replacement when repairing is no longer cost-effective and the item is out of warranty.
- The original gave no figure; the policy's figure for the CPAP device is a 5-year lifetime expectancy.

</details>

---

## q-036

**Question.** Does Policy 1-H authorize routine general-wellness telehealth visits without a specific clinical indication?

**Proposed key.** No. Policy 1-H gives overarching guidance on delivering services via telehealth; its coverage sections do not mention general-wellness visits, so nothing in it authorizes a routine wellness visit via telehealth without a clinical indication. The service must be one eligible for telehealth under Attachment A of the policy or a related coverage policy, must be medically necessary under the general rule in section 3.1, and must meet the policy's telehealth requirements, such as secure HIPAA-compliant live audio and video.

**Caveats.** Coverage depends on the underlying service being eligible for telehealth under Attachment A of Policy 1-H or a related program-specific coverage policy

**Check each pair: does the policy text say what the key says?**

1. **Key says:** 1-H gives overarching guidance on delivering services via telehealth
   **Text says:** "This policy is intended to provide new definitions and overarching guidance related to the delivery of services via telehealth, virtual communications and remote patient monitoring"
   *Policy 1H (Telehealth, Virtual Communications and Remote Patient Monitoring), Description of the Procedure, Product, or Service*

2. **Key says:** Telehealth-eligible services are those in Attachment A
   **Text says:** "Eligible services, eligible providers, and related detailed guidance for the following may be found in Attachment A below:"
   *Policy 1H (Telehealth, Virtual Communications and Remote Patient Monitoring), Telehealth, Virtual Communications, and Remote Patient Monitoring Services Covered in Clinical Coverage Policy 1-H*

3. **Key says:** Related program-specific policies hold further telehealth-eligible services (answer and caveat)
   **Text says:** "the policies listed under 'Related Clinical Coverage Policies' at the top of this document also include telehealth coverage information, such as telehealth-eligible services and providers"
   *Policy 1H (Telehealth, Virtual Communications and Remote Patient Monitoring), 3.4*

4. **Key says:** The service must be medically necessary and consistent with symptoms or a confirmed diagnosis
   **Text says:** "Medicaid shall cover the procedure, product, or service related to this policy when medically necessary, and: the procedure, product, or service is individualized, specific, and consistent with symptoms or confirmed diagnosis of the illness or injury under treatment"
   *Policy 1H (Telehealth, Virtual Communications and Remote Patient Monitoring), 3.1*

5. **Key says:** Technical requirement: secure HIPAA-compliant live audio and video
   **Text says:** "All telehealth services must be provided over a secure HIPAA compliant technology with live audio and video capabilities"
   *Policy 1H (Telehealth, Virtual Communications and Remote Patient Monitoring), 5.3.1*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 1-H governs telehealth as a modality for delivering specific covered clinical services; it does not authorize routine general-wellness visits via telehealth absent a clinical indication. The covered service must itself be a Medicaid-covered benefit, and the telehealth modality must meet the policy's technical and clinical requirements.

- Caveat 'general wellness is typically not a standalone benefit': nothing in Policy 1-H says this.
- The cited section 2.1.1 is generic eligibility text and says nothing about telehealth, wellness visits or clinical indications.
- 'does not authorize routine general-wellness visits ... absent a clinical indication' is not stated anywhere in 1-H in those terms; the policy is silent on general-wellness visits (4.2.1 reads 'None Apply'), so the point can rest only on the list of eligible services and the general medical-necessity rule in 3.1.

</details>

---

## q-037

**Question.** Does NEMT (Non-Emergency Medical Transportation) cover transportation to non-medical errands such as grocery shopping?

**Proposed key.** No. NEMT under MA-3550 is only provided for Medicaid covered services and when the primary reason for the trip is medical care. Transportation for non-medical purposes — groceries, personal errands, social visits — is not a covered NEMT service.

**Caveats.** County Departments of Social Services administer NEMT; ride authorization is locally managed

**Check each pair: does the policy text say what the key says?**

1. **Key says:** NEMT only for Medicaid covered services with medical care as the primary reason; non-medical trips are not covered
   **Text says:** "Non-Emergency Medical transportation is only provided for Medicaid covered services and when the primary reason for the trip is medical care."
   *MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT), A. Medicaid Covered Services*

2. **Key says:** A trip whose primary purpose is not medical care is not covered
   **Text says:** "Because the primary reason for the trip is to participate in the sheltered workshop program, transportation would not be covered even though a medical service is received during the course of the day."
   *MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT), A. Medicaid Covered Services*

3. **Key says:** Caveat: the administering local agency is the County Department of Social Services
   **Text says:** "Local AgencyCounty Department of Social Services"
   *MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT), XV. DEFINITIONS*

4. **Key says:** Caveat: ride authorization is locally managed
   **Text says:** "The local agency where the Medicaid beneficiary is physically located is responsible for arranging, providing, requesting reimbursement for transportation, or authorizing the trip."
   *MA-3550 NON-EMERGENCY MEDICAL TRANSPORTATION (NEMT), D. Which Local Agency is Responsible?*

<details><summary>Original key and what was wrong with it</summary>

No. NEMT under MA-3550 covers transportation to and from medically necessary covered Medicaid services only. Transportation for non-medical purposes — groceries, personal errands, social visits — is not a covered NEMT service.

- 'medically necessary covered Medicaid services': the manual's test is a Medicaid covered service with medical care as the primary reason for the trip; it uses 'medically necessary' only for ambulance transport.
- Caveat 'eligibility ... locally managed': the manual says only that the transportation coordinator verifies Medicaid eligibility at each trip request.
- The cited section _s2 is an empty heading and supports nothing.

</details>

---

## q-039

**Question.** Is private-duty nursing covered under NC Medicaid Policy 3G-1 for adult beneficiaries who do not meet medical-complexity criteria?

**Proposed key.** No. Under section 3.2.2 of Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older), Medicaid covers PDN when the health criteria in Section 3.3 are met, along with the other conditions listed there. Section 3.3.1 sets the Level 1 health criteria, which begin with dependence on a ventilator for at least eight hours per day or meeting at least four listed criteria. Adult beneficiaries who do not meet those criteria are not eligible for PDN under this policy.

**Caveats.** Policy 3G-1 lists 3G-2, Private Duty Nursing for Beneficiaries under 21 Years of Age, as a related policy; the portions of 3G-1 pertaining to beneficiaries under 21 were removed

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy 3G-1's title
   **Text says:** "3G-1 Private Duty Nursing for Beneficiaries Age 21 and Older"
   *Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older), Information:*

2. **Key says:** Section 3.2.2 covers PDN when the Section 3.3 health criteria are met, along with other conditions
   **Text says:** "Medicaid shall cover PDN when: Eligibility criteria in Section 2.0 are met; Health criteria in Section 3.3 are met;"
   *Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older), 3.2.2*

3. **Key says:** The Level 1 health criteria; beneficiaries who do not meet them are not eligible
   **Text says:** "To be eligible for Level 1 PDN services, the beneficiary shall: be dependent on a ventilator for at least eight (8) hours per day, or meet at least four (4) of the following criteria:"
   *Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older), 3.3.1*

4. **Key says:** Caveat: 3G-2 is the related policy for beneficiaries under 21
   **Text says:** "3G-2, P rivate Duty Nursing for Beneficiaries under 21 Years of Age"
   *Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older), Related Clinical Coverage Policies*

5. **Key says:** Caveat: under-21 content was removed from 3G-1
   **Text says:** "Portions of the policy pertaining to beneficiaries under 21 years of age were removed."
   *Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older), Information:*

<details><summary>Original key and what was wrong with it</summary>

No. Policy 3G-1 (Private Duty Nursing for Beneficiaries Age 21 and Older) restricts PDN to beneficiaries meeting the medical-complexity and continuous-skilled-nursing criteria in section 3.2.1. Adult beneficiaries who do not meet those criteria are not eligible for PDN; their care needs are addressed through lower-intensity benefits such as personal care services under a different policy.

- 'criteria in section 3.2.1': section 3.2.1 of Policy 3G-1 reads 'None Apply.'; the criteria are in sections 3.2.2 and 3.3.1
- 'medical-complexity criteria' as a named test: the policy has no criteria by that name; it defines 'Complex' in 1.1.4 and sets health criteria in 3.3
- 'their care needs are addressed through lower-intensity benefits such as personal care services under a different policy': Policy 3G-1 does not mention personal care services or say where such beneficiaries are served
- Caveat 'has different criteria (EPSDT)': 3G-1 only names 3G-2 as a related policy and does not describe its criteria

</details>

---

## q-040

**Question.** Does NC Medicaid cover over-the-counter medications without a prescription?

**Proposed key.** No — not as a general rule. NC Medicaid's outpatient pharmacy benefit (Clinical Coverage Policy 9) covers prescribed drugs and lists OTC products among the items Medicaid shall not cover, except that selected OTC products, including insulin, are covered when they meet the criteria in clinical coverage policy 9A, Over-The-Counter Products. Policy 9 itself gives no coverage for OTC items obtained without a prescription.

**Caveats.** Selected OTC products (e.g., insulin) are covered when they meet the Policy 9A criteria; Policy 9 separately lists prenatal vitamins and fluoride as covered

**Check each pair: does the policy text say what the key says?**

1. **Key says:** The outpatient pharmacy benefit covers prescribed drugs
   **Text says:** "The Medicaid Outpatient Pharmacy Programs shall cover prescribed drugs when they meet all the following guidelines and specific criteria listed in this policy:"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

2. **Key says:** The coverage criteria assume a prescription; nothing covers items obtained without one
   **Text says:** "The prescription must be written for whom the claim is billed"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

3. **Key says:** OTC products are listed as not covered, subject to section 3.2.1
   **Text says:** "Medicaid shall not cover the following: OTC products. Refer to Subsection 3.2.1(b)"
   *Policy 9 (Outpatient Pharmacy Program), 4.2.1*

4. **Key says:** Selected OTC products, including insulin, are covered when they meet the Policy 9A criteria (answer and caveat)
   **Text says:** "Selected OTC products including insulin are covered when they meet the criteria listed in clinical coverage policy 9A, Over the Counter Products"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

5. **Key says:** Caveat: Policy 9 lists prenatal vitamins and fluoride among covered items
   **Text says:** "Prenatal vitamins and fluoride; and"
   *Policy 9 (Outpatient Pharmacy Program), 3.2.1*

<details><summary>Original key and what was wrong with it</summary>

No — not as a general rule. NC Medicaid's outpatient pharmacy benefit covers prescribed drugs, including selected OTC drugs, only when a prescription is written by an enrolled prescriber and the drug is on the state's approved OTC list. Self-purchased OTC items without a prescription are not reimbursable.

- 'only when a prescription is written by an enrolled prescriber': Policy 9 section 3.2.1 covers 'prescribed drugs' and says nothing about the prescriber being enrolled
- 'the drug is on the state's approved OTC list': Policy 9 says only that selected OTC products are covered when they meet the criteria in Policy 9A
- 'Self-purchased ... not reimbursable': Policy 9 does not speak of self-purchase or reimbursement to beneficiaries; section 4.2.1 says OTC products are not covered, subject to 3.2.1
- Caveat naming prenatal vitamins and 'certain contraceptives' as OTCs covered with a prescription: section 3.2.1 lists 'Prenatal vitamins and fluoride' as covered without calling them OTC, and Policy 9 names no OTC contraceptive

</details>

---

## q-041

**Question.** What is the current governing federal regulation for grants administration applied to Medicaid — 45 CFR Part 74 or 45 CFR Part 75?

**Proposed key.** Neither is what 42 CFR § 430.30(e) names. The governing authority for Medicaid grants administration is 2 CFR Part 200 (Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards), together with 2 CFR part 300, which Medicaid cross-references via 42 CFR § 430.30(e). That paragraph says the provisions of 2 CFR parts 200 and 300, which establish uniform administrative requirements and cost principles, apply to all grants made to States under the subpart, with exceptions for cost sharing or matching (2 CFR 200.306) and financial reporting (2 CFR 200.328). The local corpus does not hold the text of 45 CFR Part 74 or Part 75, so an answer should not state when or whether those parts were superseded or rescinded.

**Caveats.** Some documents in the corpus cite 45 CFR Part 74 or Part 75: 42 CFR § 433.110 refers to 45 CFR part 75, an NC state plan page cites 45 CFR 75.326 for procurement, and an NC managed care contract cites 45 C.F.R. § 74.53 for record retention.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** 42 CFR § 430.30(e) applies 2 CFR parts 200 and 300 to Medicaid grants to States, with the two exceptions
   **Text says:** "(e) General administrative requirements. With the following exceptions, the provisions of 2 CFR parts 200 and 300, which establish uniform administrative requirements and cost principles, apply to all grants made to States under this subpart: (1) Cost sharing or matching, 2 CFR 200.306; and (2) Financial reporting, 2 CFR 200.328."
   *42 CFR § 430.30*

2. **Key says:** 2 CFR parts 200 and 300, by that title, are among the regulations applicable to State Medicaid programs
   **Text says:** "2 CFR parts 200 and 300—Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards."
   *42 CFR § 430.2*

3. **Key says:** 2 CFR Part 200 is the Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards
   **Text says:** "This part establishes uniform administrative requirements, cost principles, and audit requirements for Federal awards."
   *2 CFR Part 200, § 200.100*

4. **Key says:** Caveat: 42 CFR § 433.110 refers to 45 CFR part 75
   **Text says:** "Additional HHS regulations and CMS procedures for implementing these regulations are in 45 CFR part 75, 45 CFR part 95, subpart F, and part 11, State Medicaid Manual;"
   *42 CFR § 433.110*

5. **Key says:** Caveat: an NC state plan page cites 45 CFR 75.326 for procurement
   **Text says:** "The state assures that all applicable requirements of 45 CFR 75.326 for procurement of contracts will be met."
   *21-0011 PCCMe Tribal Option.pdf, 42 CFR 438.50(b)(4) C. Public Process.*

6. **Key says:** Caveat: an NC managed care contract cites 45 C.F.R. § 74.53 for record retention
   **Text says:** "Federal record retention standards are located in 45 C.F.R. § 74.53."
   *Contract--30-190029-DHB-Prepaid-Health-Plan-Services RFP, 33. PERFORMANCE BOND:*

Not checked against the corpus (advice to the reader, not a statement of policy): The local corpus does not hold the text of 45 CFR Part 74 or Part 75, so an answer should not state when or whether those parts were superseded or rescinded.

<details><summary>Original key and what was wrong with it</summary>

Neither is currently in force. 45 CFR Part 74 was superseded by 45 CFR Part 75 in December 2014 when HHS adopted the OMB Uniform Guidance, and in late 2025 HHS rescinded Part 75 as well — both 45 CFR Parts 74 and 75 are now [Reserved] in the current eCFR. The governing authority for Medicaid grants administration today is 2 CFR Part 200 (Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards), which Medicaid cross-references via 42 CFR § 430.30(e). The pipeline's CFR supersession resolver remaps both 45 CFR 74 and 45 CFR 75 citations to 2 CFR Part 200.

- '45 CFR Part 74 was superseded by 45 CFR Part 75 in December 2014 when HHS adopted the OMB Uniform Guidance': not in the corpus; 45 CFR Parts 74 and 75 are not indexed
- 'in late 2025 HHS rescinded Part 75 as well — both 45 CFR Parts 74 and 75 are now [Reserved] in the current eCFR': not in the corpus
- 'Neither is currently in force': no section states the status of either part
- 'The pipeline's CFR supersession resolver remaps both 45 CFR 74 and 45 CFR 75 citations to 2 CFR Part 200': a claim about software, not stated in any corpus section
- Caveat 'documents that predate late-2025' and 'treat those as references to 2 CFR Part 200': no section gives that date or that instruction
- 2 CFR § 200.104 as support: it speaks only of earlier OMB guidance under Title 2 and OMB circulars, not of 45 CFR Parts 74 or 75

</details>

---

## q-043

**Question.** When was the most recent change notice issued for Clinical Coverage Policy 8C (Outpatient Behavioral Health)?

**Proposed key.** The latest row in the Revision Information table of Clinical Coverage Policy 8C is dated 04/15/2025 and revises Section 3.2.2, correcting missed language complying with the Mental Health Parity and Addiction Equity Act. The same row says "Policy posted 4/15/25 amendment date not changed"; the policy header shows an Amended Date of January 1, 2025, and the rows immediately before the last one are dated 01/01/2025.

**Caveats.** Revision dates derive from the 'Revision Information' table embedded in the Policy 8C PDF. If the PDF is re-parsed, the latest date may change — validate against the live graph before rejecting an answer that cites a newer date.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Latest row is dated 04/15/2025, revises Section 3.2.2, and corrects missed parity language
   **Text says:** "| 04/15/2025 | Section 3.2.2 | Corrected missed language complying with the Mental Health Parity and Addiction Equity Act and the Code of Federal Regulations Title 42 Chapter IV Subchapter C Part 438 Subpart K, § 438.900"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), Revision Information:*

2. **Key says:** The row removes 3.2.2 (a) and says the policy was posted 4/15/25 with the amendment date not changed
   **Text says:** "Removed 3.2.2 (a): Prior authorization requirement in advance of delivering services via telephone only. Policy posted 4/15/25 amendment date not changed"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), Revision Information:*

3. **Key says:** The table has rows dated 01/01/2025
   **Text says:** "| 01/01/2025 | Attachment A: Claims-Related Information | Removed reference to LPC and LPCA."
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), Revision Information:*

4. **Key says:** The policy header shows an Amended Date of January 1, 2025
   **Text says:** "Clinical Coverage Policy No. 8C Amended Date: January 1, 2025"
   *Policy 8C (Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers), NC Medicaid Outpatient Behavioral Health Services Provided by Direct-Enrolled Providers*

Not checked against the corpus (advice to the reader, not a statement of policy): If the PDF is re-parsed, the latest date may change — validate against the live graph before rejecting an answer that cites a newer date. (caveat; a note to the grader, not a corpus fact)

<details><summary>Original key and what was wrong with it</summary>

The most recent revision to Clinical Coverage Policy 8C has an effective date of April 15, 2025 (amending Section 3.2.2), as recorded in the policy's own revision-information table. The agent should pull amendments for doc:clinical_policy:8C via getAmendments, identify the latest effective date, and cite both Policy 8C and the revision. Acceptable variants: any specific revision date returned by getAmendments that is consistent with the revision-information section of the current Policy 8C PDF.

- 'has an effective date of April 15, 2025': the table does not call 04/15/2025 an effective date; the row says 'Policy posted 4/15/25 amendment date not changed'
- evidence note that section 1.0 is the 'Base policy 8C header (effective date)': section 1.0 contains no date

</details>

---

## q-044

**Question.** Has the CAP/DA waiver policy been amended since 2024?

**Proposed key.** Yes. The copy of Clinical Coverage Policy 3K-2 (CAP/DA) in the corpus carries an Amended Date of September 1, 2025, and its Revision Information table has entries dated 11/15/2024 and 09/01/2025. The 11/15/2024 entries state that CMS approved an amended CAP/DA waiver application and that all sections in the policy were updated to align with it. The 09/01/2025 entries, the latest in the table, state that CMS approved the CAP/DA renewal waiver, effective 11/1/2024, and that sections were revised to align with it. The entries immediately before these are dated 07/01/2021.

**Caveats.** Answer reflects the copy of Policy 3K-2 in the corpus (Amended Date September 1, 2025)

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Policy 3K-2 carries an Amended Date of September 1, 2025
   **Text says:** "Clinical Coverage Policy No: 3K-2 For Disabled Adults (CAP/DA) Medicaid Amended Date: September 1, 2025"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), _s0*

2. **Key says:** Revision entries dated 11/15/2024 exist (section 1.0)
   **Text says:** "| 11/15/2024 | 1.0 | Correction made to the three service options types."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Revision Information:*

3. **Key says:** 11/15/2024 entries: CMS approved an amended waiver application; all sections updated to align, effective 11/01/2022
   **Text says:** "The Centers for Medicare and Medicaid Services (CMS) approved an amended waiver application for the CAP/DA HCBS waiver to incorporate new service options that were implemented during the public health emergency. All sections in the policy were updated to align with the newly approved waiver application effective 11/01/2022"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Revision Information:*

4. **Key says:** 09/01/2025 entries: renewal waiver effective 11/1/2024, sections revised to align
   **Text says:** "| 09/01/2025 | All sections and attachments | The Centers for Medicare and Medicaid Services (CMS) approved the CAP/DA renewal waiver, effective 11/1/2024. The following sections were revised to align with the newly approved waiver renewal, effective 11/1/2024."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Revision Information:*

5. **Key says:** The table has earlier entries dated 07/01/2021
   **Text says:** "| 07/01/2021 | All sections | This policy was posted on July 1, 2021"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), Revision Information:*

<details><summary>Original key and what was wrong with it</summary>

(none: the key held only instructions to the assistant)


</details>

---

## q-045

**Question.** What is the most recent revision to 42 CFR Part 441 as it applies to HCBS waiver applications?

**Proposed key.** In the corpus copy of 42 CFR Part 441, the section 1915(c) waiver-request sections each end with a note (labelled Authority) listing Federal Register citations, and the most recent amendment listed for each is dated May 10, 2024: § 441.301 (contents of the request) at 89 FR 40863, § 441.302 (State assurances) at 89 FR 40865, and § 441.303 (supporting documentation) at 89 FR 40866. Among the neighbouring 1915(c) sections, § 441.312 (HCBS quality measure set) lists a later Federal Register citation, 89 FR 53502, June 27, 2024. In the separate provisions for section 1915(d) waivers serving individuals age 65 or older, § 441.353 (supporting documentation) lists a later amendment, 89 FR 80069, Oct. 2, 2024.

**Caveats.** The corpus text does not state the date of the eCFR snapshot that was ingested, and the notes give only Federal Register citations and dates: they do not describe what each amendment changed.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** These sections are the section 1915(c) waiver subpart
   **Text says:** "Section 1915(c) of the Act permits States to offer, under a waiver of statutory requirements, an array of home and community-based services that an individual needs to avoid institutionalization."
   *42 CFR § 441.300*

2. **Key says:** The subpart describes what the agency must do to obtain a waiver
   **Text says:** "This subpart describes what the Medicaid agency must do to obtain a waiver."
   *42 CFR § 441.300*

3. **Key says:** § 441.301 sets the contents of the waiver request
   **Text says:** "(a) A request for a waiver under this section must consist of the following:"
   *42 CFR § 441.301*

4. **Key says:** § 441.301's most recent listed amendment is 89 FR 40863, May 10, 2024
   **Text says:** "[Authority: [46 FR 48541, Oct. 1, 1981, as amended at 50 FR 10026, Mar. 13, 1985; 59 FR 37717, July 25, 1994; 65 FR 60107, Oct. 10, 2000; 79 FR 3029, Jan. 16, 2014; 89 FR 40863, May 10, 2024]]"
   *42 CFR § 441.301*

5. **Key says:** § 441.302 sets the State assurances
   **Text says:** "Unless the Medicaid agency provides the following satisfactory assurances to CMS, CMS will not grant a waiver under this subpart"
   *42 CFR § 441.302*

6. **Key says:** § 441.302's most recent listed amendment is 89 FR 40865, May 10, 2024
   **Text says:** "[Authority: [50 FR 10026, Mar. 13, 1985, as amended at 59 FR 37717, July 25, 1994; 65 FR 60107, Oct. 10, 2000; 79 FR 3031, Jan. 16, 2014; 89 FR 40865, May 10, 2024]]"
   *42 CFR § 441.302*

7. **Key says:** § 441.303 sets the supporting documentation
   **Text says:** "The agency must furnish CMS with sufficient information to support the assurances required by § 441.302."
   *42 CFR § 441.303*

8. **Key says:** § 441.303's most recent listed amendment is 89 FR 40866, May 10, 2024
   **Text says:** "[Authority: [46 FR 48532, Oct. 1, 1981, as amended at 50 FR 10027, Mar. 13, 1985; 50 FR 25080, June 17, 1985; 59 FR 37718, July 25, 1994; 89 FR 40866, May 10, 2024]]"
   *42 CFR § 441.303*

9. **Key says:** § 441.312 is a section 1915(c) waiver section on the HCBS quality measure set
   **Text says:** "This section describes the Home and Community-Based Services Quality Measure Set, which States are required to use in section 1915(c) waiver programs"
   *42 CFR § 441.312*

10. **Key says:** § 441.312 lists a later citation, 89 FR 53502, June 27, 2024
   **Text says:** "[Authority: [89 FR 40868, May 10, 2024; 89 FR 53502, June 27, 2024]]"
   *42 CFR § 441.312*

11. **Key says:** The parallel subpart is for section 1915(d) waivers serving individuals age 65 or older
   **Text says:** "Section 1915(d) of the Act permits States to offer, under a waiver of statutory requirements, home and community-based services not otherwise available under Medicaid to individuals age 65 or older"
   *42 CFR § 441.350*

12. **Key says:** § 441.353 sets supporting documentation for the 1915(d) waiver
   **Text says:** "The agency must furnish CMS with sufficient information to support the assurances required under § 441.352"
   *42 CFR § 441.353*

13. **Key says:** § 441.353 lists an amendment at 89 FR 80069, Oct. 2, 2024
   **Text says:** "[Authority: [57 FR 29156, June 30, 1992, as amended at 81 FR 3012, Jan. 20, 2016; 89 FR 80069, Oct. 2, 2024]]"
   *42 CFR § 441.353*

<details><summary>Original key and what was wrong with it</summary>

The latest revision is the one reflected in the eCFR snapshot currently ingested into the corpus.

- 'The latest revision is the one reflected in the eCFR snapshot currently ingested into the corpus': names no revision or date, and no section text states a snapshot or ingestion date
- the evidence note calling §§ 441.351 onward a 'parallel newer numbering family': § 441.350 shows it is a different subpart, for section 1915(d) waivers serving individuals age 65 or older

</details>

---

## q-046

**Question.** What federal regulation authorizes NC Medicaid's 1915(c) HCBS waivers such as CAP/DA?

**Proposed key.** Section 1915(c) of the Social Security Act provides the statutory authority for HCBS waivers. The implementing regulations are in 42 CFR Part 441 — specifically § 441.301 (contents of the request for a waiver), § 441.302 (State assurances), and § 441.303 (supporting documentation). CAP/DA is North Carolina's HCBS waiver authorized under section 1915(c) for adults with disabilities; its clinical coverage policy states that federal regulations for HCBS waivers are found in 42 CFR Part 441 Subpart G.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Section 1915(c) of the Act is the statutory authority for HCBS waivers
   **Text says:** "Section 1915(c) of the Act permits States to offer, under a waiver of statutory requirements, an array of home and community-based services that an individual needs to avoid institutionalization."
   *42 CFR § 441.300*

2. **Key says:** The subpart containing §§ 441.301-441.303 describes what the agency must do to obtain a waiver
   **Text says:** "This subpart describes what the Medicaid agency must do to obtain a waiver."
   *42 CFR § 441.300*

3. **Key says:** § 441.301 sets the contents of the waiver request; § 441.302 holds assurances and § 441.303 supporting documentation
   **Text says:** "(a) A request for a waiver under this section must consist of the following: (1) The assurances required by § 441.302 and the supporting documentation required by § 441.303."
   *42 CFR § 441.301*

4. **Key says:** § 441.302 sets the State assurances
   **Text says:** "Unless the Medicaid agency provides the following satisfactory assurances to CMS, CMS will not grant a waiver under this subpart and may terminate a waiver already granted"
   *42 CFR § 441.302*

5. **Key says:** § 441.303 sets the supporting documentation
   **Text says:** "The agency must furnish CMS with sufficient information to support the assurances required by § 441.302."
   *42 CFR § 441.303*

6. **Key says:** CAP/DA is an HCBS waiver authorized under section 1915(c) of the Social Security Act and complies with 42 CFR § 440.180
   **Text says:** "The Community Alternatives Program for Disabled Adults (CAP/DA) is a Medicaid Home and Community-Based Services (HCBS) Waiver authorized under section1915(c) of the Social Security Act and complies with 42 CFR § 440.180, Home and community-based waiver services."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

7. **Key says:** The regulations are in 42 CFR Part 441 Subpart G
   **Text says:** "Federal regulations for HCBS waivers are found in 42 CFR Part 441 Subpart G, Home and Community-Based Services: Waiver Requirements."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

8. **Key says:** CAP/DA serves adults with disabilities 18 and older at risk of institutionalization
   **Text says:** "is a waiver that serves an adult with disabilities 18 years of age and older who is at risk of institutionalization"
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

9. **Key says:** CAP/DA is North Carolina's waiver: NC Medicaid is its administrative authority
   **Text says:** "Pursuant to 42 CFR§ 431.10, NC Medicaid is the administrative authority of the waiver and outlines the policies and procedures governing the waiver."
   *Policy 3K-2 (Community Alternatives Program for Disabled Adults (CAP/DA)), 1.0*

<details><summary>Original key and what was wrong with it</summary>

Section 1915(c) of the Social Security Act (42 USC § 1396n(c)) provides the statutory authority for HCBS waivers. The implementing regulations are in 42 CFR Part 441 Subpart G — specifically § 441.301 (state plan requirements), § 441.302 (assurances), and § 441.303 (supporting documentation). CAP/DA is North Carolina's 1915(c) waiver implementing those requirements for disabled adults.

- '§ 441.301 (state plan requirements)': contradicted; § 441.301 is 'Contents of request for a waiver' and lists what a waiver request must consist of
- '42 USC § 1396n(c)': not in the corpus (federal statute text is not ingested; the regulation and policy refer only to section 1915(c) of the Act)
- 'Subpart G' as the label of §§ 441.301-441.303: the Part 441 section text never names its subpart; only policy 3K-2 section 1.0 uses the label
- 'CAP/DA is North Carolina's 1915(c) waiver implementing those requirements for disabled adults': no cited section supported it; the supported wording is in policy 3K-2 section 1.0

</details>

---

## q-048

**Question.** What federal rule governs the Medical Loss Ratio (MLR) requirements for Medicaid managed care contracts?

**Proposed key.** 42 CFR § 438.8 establishes the Medical Loss Ratio standards for Medicaid managed care contracts. It requires States to ensure, through their contracts, that each MCO, PIHP, and PAHP calculates and reports an MLR, and prescribes the methodology for calculating and reporting it: the MLR is the ratio of a numerator (incurred claims, expenditures for activities that improve health care quality, and fraud prevention activities) to a denominator of adjusted premium revenue, which includes State capitation payments. The rule sets 85 percent as a floor only if a State elects to mandate a minimum MLR for its MCOs, PIHPs, or PAHPs: in that case the minimum must be equal to or higher than 85 percent.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** States must ensure through contracts that each MCO, PIHP and PAHP calculates and reports an MLR; the section governs MLR for managed care contracts
   **Text says:** "The State must ensure, through its contracts starting on or after July 1, 2017, that each MCO, PIHP, and PAHP calculate and report a MLR in accordance with this section."
   *42 CFR § 438.8*

2. **Key says:** 85 percent is a floor only if a State elects to mandate a minimum MLR
   **Text says:** "If a State elects to mandate a minimum MLR for its MCOs, PIHPs, or PAHPs, that minimum MLR must be equal to or higher than 85 percent"
   *42 CFR § 438.8*

3. **Key says:** Calculation methodology: ratio of numerator to denominator
   **Text says:** "The MLR experienced for each MCO, PIHP, or PAHP in a MLR reporting year is the ratio of the numerator (as defined in paragraph (e) of this section) to the denominator (as defined in paragraph (f) of this section)."
   *42 CFR § 438.8*

4. **Key says:** Numerator includes incurred claims
   **Text says:** "is the sum of the MCO's, PIHP's, or PAHP's incurred claims"
   *42 CFR § 438.8*

5. **Key says:** Numerator includes quality-improvement expenditures and fraud prevention activities
   **Text says:** "expenditures for activities that improve health care quality (as defined in paragraph (e)(3) of this section); and fraud prevention activities (as defined in paragraph (e)(4) of this section)."
   *42 CFR § 438.8*

6. **Key says:** Denominator is adjusted premium revenue
   **Text says:** "MLR for a MLR reporting year must equal the adjusted premium revenue."
   *42 CFR § 438.8*

7. **Key says:** Premium revenue includes State capitation payments
   **Text says:** "(i) State capitation payments, developed in accordance with § 438.4, to the MCO, PIHP, or PAHP for all enrollees under a risk contract approved under § 438.3(a)"
   *42 CFR § 438.8*

8. **Key says:** The section prescribes MLR reporting
   **Text says:** "The State, through its contracts, must require each MCO, PIHP, or PAHP to submit a report to the State that includes at least the following information for each MLR reporting year"
   *42 CFR § 438.8*

<details><summary>Original key and what was wrong with it</summary>

42 CFR § 438.8 establishes the Medical Loss Ratio requirements for Medicaid and CHIP managed care contracts. It sets the minimum percentage of capitation payments that plans must spend on clinical services and quality-improvement activities (85% minimum for MCOs), and prescribes the methodology for calculating and reporting MLR.

- That § 438.8 covers CHIP managed care contracts: the section's text never mentions CHIP.
- That § 438.8 sets an unconditional 85% minimum that plans must spend: 438.8(c) applies 85 percent only 'If a State elects to mandate a minimum MLR'.
- That the 85% figure is specific to MCOs: 438.8(c) applies to MCOs, PIHPs, and PAHPs alike.
- The term 'clinical services': the section's numerator is incurred claims, activities that improve health care quality, and fraud prevention activities.

</details>

---

## q-050

**Question.** What federal regulation governs provider enrollment screening requirements for Medicaid?

**Proposed key.** 42 CFR Part 455 Subpart E governs Medicaid provider enrollment and screening requirements. It establishes risk-based screening levels (limited, moderate, high), fingerprint-based background checks for high-risk categories, site visits, and revalidation requirements. States must screen all providers at enrollment and re-validate at least every five years.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** The subpart governs Medicaid provider enrollment and screening requirements
   **Text says:** "It sets forth State plan requirements regarding the following: (a) Provider screening and enrollment requirements."
   *42 CFR § 455.400*

2. **Key says:** The provider screening and enrollment requirements are those of 42 CFR Part 455 Subpart E
   **Text says:** "consistent with the provider disclosure, screening and enrollment requirements of part 455, subparts B and E of this chapter"
   *42 CFR § 438.608*

3. **Key says:** Subpart E of part 455, named on its own, is the provider screening subpart
   **Text says:** "(b) Part 455, subpart E, of this chapter."
   *42 CFR § 457.990*

4. **Key says:** The enrollment requirements sit in 42 CFR Part 455 Subpart E
   **Text says:** "all applicable provisions of 42 CFR part 455, subparts B and E"
   *42 CFR § 455.410*

5. **Key says:** States must screen all providers
   **Text says:** "The State Medicaid agency must require all enrolled providers to be screened under to this subpart."
   *42 CFR § 455.410*

6. **Key says:** Risk-based screening levels (limited, moderate, high); screening at enrollment
   **Text says:** "A State Medicaid agency must screen all initial applications, including applications for a new practice location, and any applications received in response to a re-enrollment or revalidation of enrollment request based on a categorical risk level of “limited,” “moderate,” or “high.”"
   *42 CFR § 455.450*

7. **Key says:** Fingerprint-based background checks for high-risk categories
   **Text says:** "(2)(i) Conduct a criminal background check; and (ii) Require the submission of a set of fingerprints in accordance with § 455.434."
   *42 CFR § 455.450*

8. **Key says:** Site visits
   **Text says:** "Must conduct pre-enrollment and post-enrollment site visits of providers who are designated as “moderate” or “high” categorical risks to the Medicaid program."
   *42 CFR § 455.432*

9. **Key says:** Revalidation requirements; re-validate at least every five years
   **Text says:** "The State Medicaid agency must revalidate the enrollment of all providers regardless of provider type at least every 5 years."
   *42 CFR § 455.414*

<details><summary>Original key and what was wrong with it</summary>

42 CFR Part 455 Subpart E (§§ 455.400–455.470) governs Medicaid provider enrollment and screening requirements. It establishes risk-based screening levels (limited, moderate, high), fingerprint-based background checks for high-risk categories, site visits, and revalidation requirements. States must screen all providers at enrollment and re-validate at least every five years.

- The section range '§§ 455.400–455.470' for Subpart E is not stated in any section's text; the nearest text is 455.405, which names '§ 455.410 through § 455.450 and § 455.470' as State plan requirements, a different range.

</details>

---

# Part 3: set aside unless someone with legal training reads them (3 keys)

- **q-021** (medical loss ratio) depends on which contract amendment is currently operative.
- **q-033** (appeals of a prior authorization denial) depends on how the State agency route and the managed care plan route differ, and on which deadline applies to each.
- **q-049** (the federal authority for EPSDT) depends on how the statute, the federal regulations and North Carolina policy text relate.

The pairs are given so the reading check can still be done, but a pair holding does not settle these.

## q-021

**Question.** What medical loss ratio (MLR) must Medicaid managed care organizations meet under federal law, and how does NC implement this requirement?

**Proposed key.** Under 42 CFR 438.8, States must ensure through their contracts that each Medicaid managed care plan calculates and reports a medical loss ratio (MLR). It does not itself mandate a minimum: if a State elects to mandate a minimum MLR, it must be equal to or higher than 85 percent, and 42 CFR 438.4(b)(9) requires capitation rates to be developed so that a plan would reasonably achieve an MLR of at least 85 percent. NC implements this through its Medicaid managed care contracts: the Prepaid Health Plan contract requires each plan to calculate and report annually both the CMS-defined MLR and a Department-defined MLR, and sets the minimum MLR threshold in aggregate across all contracted plans at 88 percent. A plan whose Department-defined MLR is below its minimum threshold must remit a rebate to the Department or, with Department approval, put some or all of that amount into health-related resources or public health and Health Equity initiatives.

**Caveats.** The 88 percent threshold is an aggregate across all contracted plans; each plan's own threshold is a revenue-weighted figure based on its capitation revenue mix, calculated separately for the Medicaid Expansion and non-Expansion populations; The MLR may be increased by a credibility adjustment (42 CFR 438.8(h)), and the contract adjusts the numerator of the Department-defined MLR; Other plan types have their own contract terms: the BH I/DD Tailored Plan contract, as amended, also sets its minimum MLR threshold at 88 percent, while the Medicaid Direct PIHP contract set 88 percent and its Amendment 1 revised that to 85 percent

**Check each pair: does the policy text say what the key says?**

1. **Key says:** States must ensure through contracts that plans calculate and report an MLR
   **Text says:** "The State must ensure, through its contracts starting on or after July 1, 2017, that each MCO, PIHP, and PAHP calculate and report a MLR in accordance with this section."
   *42 CFR § 438.8*

2. **Key says:** a minimum is the State's election; 85 percent floor if mandated
   **Text says:** "If a State elects to mandate a minimum MLR for its MCOs, PIHPs, or PAHPs, that minimum MLR must be equal to or higher than 85 percent"
   *42 CFR § 438.8*

3. **Key says:** 438.4(b)(9): capitation rates developed so a plan would reasonably achieve at least 85 percent
   **Text says:** "Be developed in such a way that the MCO, PIHP, or PAHP would reasonably achieve a medical loss ratio standard, as calculated under § 438.8, of at least 85 percent for the rate year."
   *42 CFR § 438.4*

4. **Key says:** NC contract requires annual calculation and reporting on two bases
   **Text says:** "The PHP shall calculate and report aggregate MLR on an annual basis aligned to the rating year on two bases as follows:"
   *Contract--30-190029-DHB-Prepaid-Health-Plan-Services RFP, 2. Medical Loss Ratio*

5. **Key says:** first basis: the CMS-defined MLR (current restated wording)
   **Text says:** "The PHP shall calculate the CMS-defined MLR experienced in a MLR reporting year as defined in 42 C.F.R. § 438.8."
   *30-190029-DHB SP Amendment 25 (26)_Risk Mit_Model (Final), i. Section V. I. Financial Requirements, 2. Medical Loss Ratio, b., i., is revised and restated in its entirety as follows:*

6. **Key says:** second basis: the Department-defined MLR (current restated wording)
   **Text says:** "The PHP shall calculate the Departmentdefi ned MLR experienced for all Non-Expansion Medicaid populations in a MLR reporting year as the ratio of the numerator and denominator."
   *Contract, www. Section V. I. Financial Requirements, 2. Medical Loss Ratio, b., iv. is revised and restated as follows:*

7. **Key says:** Department-defined MLR calculated and reported annually (Expansion population, latest restatement)
   **Text says:** "The PHP shall calculate and report a distinct aggregate Department -defined MLR for Medicaid Expansion Eligible Member population on an annual basis aligned to the rating year (from the start of Medicaid Expansion through June 30, 2024, and annually for each rating period beginning on July 1 through June 30 thereafter)."
   *Contract, bbbb. Section V. I. Financial Requirements, 2. Medical Loss Ratio, i. Minimum Medical Loss Ratio for Medicaid Expansion Eligible Member Population, i. is revised and restated as follows with no revisions to subparts 1-6:*

8. **Key says:** 88 percent aggregate minimum MLR threshold (base contract, general clause)
   **Text says:** "The minimum MLR threshold in aggregate across all contracted PHPs shall be exactly eighty-eight percent (88%) as required by Section 5.(6)c. of Session Law 2015-245, as amended by Session Law 2018-49."
   *Contract--30-190029-DHB-Prepaid-Health-Plan-Services RFP, 2. Medical Loss Ratio*

9. **Key says:** 88 percent aggregate minimum MLR threshold (Medicaid Expansion population clause)
   **Text says:** "The minimum MLR threshold in aggregate across all contracted PHPs shall be exactly eighty-eight percent (88%) as required by Section 5.(6)c. of Session Law 2015-245, as amended by Session Law 2018-49."
   *Contract #30-190029 Prepaid Health Plan Services Amendment 16/17, c. Section V.I. Financial Requirements, 2. Medical Loss Ratio is revised to add the following:*

10. **Key says:** below the threshold the plan must act; rebate to the Department
   **Text says:** "is less than the minimum MLR threshold, the PHP shall do one of the following: Remit to the Department a rebate equal to the denominator of the"
   *Contract, aaaa. Section V. I. Financial Requirements, 2. Medical Loss Ratio, d. is revised and restated as follows:*

11. **Key says:** contribution to health-related resources
   **Text says:** "Contribute to health-related resources targeted towards highimpact initiatives"
   *Contract, aaaa. Section V. I. Financial Requirements, 2. Medical Loss Ratio, d. is revised and restated as follows:*

12. **Key says:** contributions are Department-approved; public health and Health Equity initiatives
   **Text says:** "a proposal for contributions must align with the Department's Quality Strategy and be reviewed and approved by the Department; Contribute to initiatives that advance public health and Health Equity in alignment with the Department's Quality Strategy, subject to approval by the Department;"
   *Contract, aaaa. Section V. I. Financial Requirements, 2. Medical Loss Ratio, d. is revised and restated as follows:*

13. **Key says:** split between contributions and a rebate
   **Text says:** "and the remaining portion to a rebate to the Department"
   *Contract, aaaa. Section V. I. Financial Requirements, 2. Medical Loss Ratio, d. is revised and restated as follows:*

14. **Key says:** caveat 1: plan-specific threshold is revenue weighted
   **Text says:** "the minimum MLR threshold for the PHP shall be calculated based on the capitation revenue mix of the PHP, by taking the revenue weighted average of each of the"
   *Contract #30-190029 Prepaid Health Plan Services Amendment 16/17, c. Section V.I. Financial Requirements, 2. Medical Loss Ratio is revised to add the following:*

15. **Key says:** caveat 1: separate Expansion and non-Expansion thresholds
   **Text says:** "The minimum MLR threshold shall be calculated separately for the Expansion population in total and the non-Expansion population in total."
   *Contract #30-190029 Prepaid Health Plan Services Amendment 16/17, c. Section V.I. Financial Requirements, 2. Medical Loss Ratio is revised to add the following:*

16. **Key says:** caveat 2: the MLR may be increased by a credibility adjustment under paragraph (h)
   **Text says:** "A MLR may be increased by a credibility adjustment, in accordance with paragraph (h) of this section."
   *42 CFR § 438.8*

17. **Key says:** caveat 2: the contract adjusts the numerator of the Department-defined MLR
   **Text says:** "The numerator of the Departmentdefined MLR shall be calculated in a manner similar to the CMS -defined MLR with the following adjustments:"
   *Contract, www. Section V. I. Financial Requirements, 2. Medical Loss Ratio, b., iv. is revised and restated as follows:*

18. **Key says:** caveat 3: Tailored Plan threshold is 88 percent
   **Text says:** "The minimum MLR threshold for the BH I/DD Tailored Plan shall be eighty-eight percent (88%)"
   *Contract #30-2020-052-DHB-TP Amendment 5/7, ddddd. Section V. B. Medicaid, 7. Financial Requirements, ii. Medical Loss Ratio is revised and restated in its entirety as follows:*

19. **Key says:** caveat 3: the Medicaid Direct PIHP contract itself set 88 percent
   **Text says:** "The minimum MLR threshold for the PIHP shall be eighty-eight percent (88%)."
   *Medicaid Direct Prepaid Inpatient Health Plan Contract, K. Financial Requirements*

20. **Key says:** caveat 3: PIHP Amendment 1 sets 85 percent
   **Text says:** "The minimum MLR threshold for the PIHP shall be eighty-five percent (85%)."
   *30-2022-007-DHB MD PIHP Amendment 1 (Model March 2023), wwwww. Section IV. Scope of Services, J. Claims and Encounter Management, 1. Claims is revised to add the following:*

<details><summary>Original key and what was wrong with it</summary>

Under 42 CFR 438.8, Medicaid managed care organizations must meet medical loss ratio standards. The MLR is calculated as the ratio of clinical services spending to total premium revenue, ensuring that a minimum percentage of premiums is spent on medical care rather than administrative costs or profit. States must set an MLR standard in their managed care contracts. The federal regulation specifies the methodology for calculating the MLR, including what counts as clinical spending vs. administrative costs. NC implements this through its Medicaid managed care contracts and monitors compliance through reporting requirements.

- States must set an MLR standard in their managed care contracts (contradicted: 438.8(c) applies a floor only if a State elects to mandate a minimum; what States must require is calculation and reporting)
- The MLR ensures a minimum percentage of premiums is spent on medical care rather than administrative costs or profit (purpose not stated in 438.8)
- NC implements this through its contracts and monitors compliance through reporting (true, but no North Carolina section was cited)
- Caveat: NC's threshold may differ from other states (the corpus says nothing about other states)
- Caveat: Tailored Plans may have different MLR requirements (the Tailored Plan contract sets the same 88 percent threshold)
- Caveat: 'MLR calculation methodology is complex with many adjustable components' ('complex' and 'many' are characterisations no section states; the texts give a credibility adjustment and numerator adjustments)

</details>

---

## q-033

**Question.** If NC Medicaid denies prior authorization for a service, can the beneficiary appeal directly to CMS?

**Proposed key.** No. Medicaid prior-authorization denials are appealed through the state administrative process, not directly to CMS. Federal rules require the State agency to grant a hearing on a prior authorization decision (42 CFR 431.220), and in North Carolina the Office of Administrative Hearings makes the final decision when NC Medicaid or one of its contractors denies a service; a plan member must first appeal to the plan and may request a State Fair Hearing if it upholds the denial or misses its notice and timing requirements. If the answer gives a time limit for requesting the hearing, it must either give a North Carolina limit taken from a North Carolina source for that kind of decision (for a plan denial, North Carolina's plan contracts allow 120 calendar days from the plan's Notice of Resolution), or present the federal figure (State agency denial, 42 CFR 431.221(d): a reasonable time, not to exceed 90 days from mailing of the notice of action; plan denial, 42 CFR 438.408(f)(2): 90 to 120 calendar days from the plan's notice of resolution) explicitly as the federal bound and tell the person to check the deadline printed on their notice, which for a State agency denial may be shorter than the federal maximum, and to confirm it promptly with the agency or plan that sent it or with legal aid. An answer that gives 90 days as the North Carolina deadline, or as the only time limit under a North Carolina heading without that qualification, is incorrect.

**Caveats.** Federal rules make the single State agency responsible for fair hearings under 42 CFR Part 431 Subpart E; A federal maximum is not by itself the North Carolina deadline; for a State agency denial the deadline printed on the notice may be shorter and should be confirmed promptly; A North Carolina time limit must come from a North Carolina source

**Check each pair: does the policy text say what the key says?**

1. **Key says:** The appeal is a hearing granted by the State agency, not by CMS
   **Text says:** "(a) The State agency must grant an opportunity for a hearing to the following: (1) Any individual who requests it because he or she believes the agency has taken an action erroneously, denied his or her claim for eligibility or for covered benefits or services"
   *42 CFR § 431.220*

2. **Key says:** A prior authorization decision carries the right to that state hearing
   **Text says:** "(vi) A prior authorization decision."
   *42 CFR § 431.220*

3. **Key says:** The State agency's hearing duty also covers managed care plan enrollees, under Part 438 Subpart F
   **Text says:** "(4) Any MCO, PIHP, or PAHP enrollee who is entitled to a hearing under subpart F of part 438 of this chapter."
   *42 CFR § 431.220*

4. **Key says:** Older, narrowly scoped example (services requested by a CCNC/CA provider): the appeal of Medicaid's own decision is sent to the Office of Administrative Hearings; it also shows a North Carolina limit (30 days from mailing) for that kind of decision. The answer does not assert 30 days.
   **Text says:** "If the recipient decides to appeal Medicaid's decision to deny, terminate, reduce, or suspend the services requested by the CCNC/CA provider, the recipient or personal representative must sign and date the appeal request form and send it to the Office of Administrative Hearings (OAH) by mail or fax within 30 days of the date the notice was mailed"
   *MA-2905- MEDICAID COVERED SERVICES, H. Medicaid Recipient Due Process Rights*

5. **Key says:** A member of an NC Medicaid Managed Care plan must first appeal to the plan
   **Text says:** "Specifically, in North Carolina, members in NC Medicaid Managed Care must first seek to resolve appeals with their plan"
   *2023 NC Medicaid Managed Care Quality Strategy, Member Appeals*

6. **Key says:** The plan member may request a fair hearing (through the Office of Administrative Hearings) if the plan upholds the denial
   **Text says:** "If the plan upholds the adverse benefit determination, the member may request a fair hearing through the Office of Administrative Hearings"
   *2023 NC Medicaid Managed Care Quality Strategy, Member Appeals*

7. **Key says:** Federal rule behind the plan-appeal-first step
   **Text says:** "(1) Availability. An enrollee may request a State fair hearing only after receiving notice that the MCO, PIHP, or PAHP is upholding the adverse benefit determination."
   *42 CFR § 438.408*

8. **Key says:** The federal figure for a denial by the State agency: a reasonable time, not to exceed 90 days from mailing of the notice
   **Text says:** "(d) The agency must allow the applicant or beneficiary a reasonable time, not to exceed 90 days from the date that notice of action is mailed, to request a hearings."
   *42 CFR § 431.221*

9. **Key says:** The federal figure for a denial by a managed care plan: 90 to 120 calendar days from the plan's notice of resolution
   **Text says:** "(2) State fair hearing. The enrollee must have no less than 90 calendar days and no more than 120 calendar days from the date of the MCO's, PIHP's, or PAHP's notice of resolution to request a State fair hearing."
   *42 CFR § 438.408*

10. **Key says:** Caveat 1: the single State agency is responsible for Subpart E fair hearings
   **Text says:** "(3) The single State agency is responsible for determining eligibility for all individuals applying for or receiving benefits in accordance with regulations in part 435 of this chapter and for fair hearings filed in accordance with subpart E of this part."
   *42 CFR § 431.10*

11. **Key says:** In North Carolina the Office of Administrative Hearings makes the final agency decision in a beneficiary's contested case
   **Text says:** "The Office of Administrative Hearings will make final agency decisions in contested Medicaid beneficiary and provider cases as defined in paragraphs (1) and (2) below."
   *State Plan under Title XIX of the Social Security Act Medical Assistance Program, Medicaid Administration*

12. **Key says:** That route covers a denial of a service by NC Medicaid or one of its contractors
   **Text says:** ""Contested Medicaid beneficiary cases" are those defined in N.C.G.S. §150B-22 in which the single state Medicaid agency or one of its contractors or agents denies, reduces, terminates or suspends (or alleges such a decision was not acted upon with reasonable promptness), a Medicaid-reimbursable service."
   *State Plan under Title XIX of the Social Security Act Medical Assistance Program, Medicaid Administration*

13. **Key says:** North Carolina source for plan denials, Standard Plan: 120 calendar days from the date on the plan's Notice of Resolution
   **Text says:** "The PHP shall allow Members or, an authorized representative, one hundred and twenty (120) Calendar Days from the date on the Notice of Resolution issued by the PHP upholding, in whole or in part, the adverse benefit determination to request a State Fair Hearing."
   *Contract #30-190029 Prepaid Health Plan Services Amendment 13/14, g. Section V.B. Members, 6. Member Grievance and Appeals, f. State Fair Hearing Process is revised and restated as follows:*

14. **Key says:** Same limit in the Tailored Plan contract
   **Text says:** "The BH I/DD Tailored Plan shall allow members or, an authorized representative, one hundred and twenty (120) Calendar Days from the date on the Notice of Resolution issued by the BH I/DD Tailored Plan upholding, in whole or in part, the Adverse Benefit Determination to request a State Fair Hearing."
   *Contract #30-2020-052 Behavioral Health and I/DD Tailored Plan Amendment 1, iv. Marketing*

15. **Key says:** Same limit in the PIHP contract
   **Text says:** "The PIHP shall allow Members or their authorized representatives one hundred twenty (120) Calendar Days from the date on the Notice of Resolution issued by the PIHP upholding, in whole or in part, the Adverse Benefit Determination to request a State Fair Hearing."
   *Medicaid Direct Prepaid Inpatient Health Plan Contract, x. Extension of Standard Resolution of Appeal*

16. **Key says:** Same limit in the Children and Families Specialty Plan contract
   **Text says:** "The CFSP shall allow Members or, an Authorized Representative, one hundred and twenty (120) Calendar Days from the date on the Notice of Resolution issued by the CFSP upholding, in whole or in part, the Adverse Benefit Determination to request a State Fair Hearing."
   *Contract #30-2024-001-DHB-Children and Families Specialty Plan Section V, 8) Request for Plan Appeals*

17. **Key says:** A member may also request a State Fair Hearing when the plan misses its notice and timing requirements (deemed exhaustion)
   **Text says:** "members will be deemed to have exhausted the BH I/DD Tailored Plan's internal Appeal process and can request a State Fair Hearing"
   *Contract #30-2020-052 Behavioral Health and I/DD Tailored Plan Amendment 1, iv. Marketing*

18. **Key says:** Federal rule on deemed exhaustion when the plan fails its notice and timing requirements
   **Text says:** "the enrollee is deemed to have exhausted the MCO's, PIHP's, or PAHP's appeals process. The enrollee may initiate a State fair hearing."
   *42 CFR § 438.408*

19. **Key says:** Corroboration, within a waiver document, of the 30-day North Carolina figure for a State agency decision; the answer does not assert it
   **Text says:** "Appealing a Medicaid Adverse decision 30 days of the date the notice was mailed"
   *Community Alternatives Program for Disabled Adults Approved Waiver, Appendix F-1: Opportunity to Request a Fair Hearing*

20. **Key says:** the hearing is in the State's system, not a federal forum
   **Text says:** "(a) The Medicaid agency must be responsible for maintaining a hearing system that meets the requirements of this subpart."
   *42 CFR § 431.205*

Not checked against the corpus (advice to the reader, not a statement of policy): If the answer gives a time limit for requesting the hearing, it must either give a North Carolina limit taken from a North Carolina source for that kind of decision (for a plan denial, North Carolina's plan contracts allow 120 calendar days from the plan's Notice of Resolution), or present the federal figure (State agency denial, 42 CFR 431.221(d): a reasonable time, not to exceed 90 days from mailing of the notice of action; plan denial, 42 CFR 438.408(f)(2): 90 to 120 calendar days from the plan's notice of resolution) explicitly as the federal bound and tell the person to check the deadline printed on their notice, which for a State agency denial may be shorter than the federal maximum, and to confirm it promptly with the agency or plan that sent it or with legal aid.; An answer that gives 90 days as the North Carolina deadline, or as the only time limit under a North Carolina heading without that qualification, is incorrect.; A federal maximum is not by itself the North Carolina deadline; for a State agency denial the deadline printed on the notice may be shorter and should be confirmed promptly; A North Carolina time limit must come from a North Carolina source

<details><summary>Original key and what was wrong with it</summary>

No. Medicaid prior-authorization denials are appealed through the state administrative process, not directly to CMS. The beneficiary must first request reconsideration or a state fair hearing under NC's procedures; CMS is the federal oversight agency for state Medicaid programs but does not adjudicate individual beneficiary appeals. If the answer gives a time limit for requesting the hearing, it must either give a North Carolina limit taken from a North Carolina source for that kind of decision, or present the federal figure (42 CFR 431.221(d): a reasonable time, not to exceed 90 days from the date the notice of action is mailed) explicitly as the federal maximum and tell the person to check the deadline printed on their notice, which may be shorter than the federal bound, and to confirm it promptly with the agency that sent it or with legal aid. An answer that gives 90 days as the North Carolina deadline, or as the only time limit under a North Carolina heading without that qualification, is incorrect.

- 'must first request reconsideration': no located section gives a beneficiary a 'reconsideration' step for a prior authorization denial; the first step the corpus does describe is an appeal to the plan, for members of an NC Medicaid Managed Care plan only.
- 'CMS is the federal oversight agency for state Medicaid programs but does not adjudicate individual beneficiary appeals': not stated in the corpus; the regulation states the positive rule that the State agency grants the hearing.
- Caveat 'Federal oversight applies to state program compliance, not to individual PA denials': not stated in the corpus.
- 42 CFR 431.221(d) was relied on in the answer text but 431.221 was not among the cited sections.
- The 90-day figure was presented as the federal maximum for every prior authorization denial; for a denial by a managed care plan the federal window is 42 CFR 438.408(f)(2), 90 to 120 calendar days from the plan's notice of resolution, and the North Carolina plan contracts set 120 calendar days.

</details>

---

## q-049

**Question.** What is the federal authority for Medicaid EPSDT (Early and Periodic Screening, Diagnostic, and Treatment) services?

**Proposed key.** Federal parity regulations (42 CFR 438.900 and 440.395) define EPSDT benefits as those defined in section 1905(r) of the Social Security Act, which NC clinical coverage policies cite as 42 U.S.C. § 1396d(r). 42 CFR 440.40(b) defines EPSDT and refers to subpart B of Part 441; § 441.50 states that its subpart implements sections 1902(a)(43) and 1905(a)(4)(B) of the Act by prescribing State plan requirements for screening, diagnosis and treatment of beneficiaries under age 21. As NC clinical coverage policies describe 42 U.S.C. § 1396d(r), it requires the state Medicaid agency to cover a service for a beneficiary under 21 if it is medically necessary health care to correct or ameliorate a defect, physical or mental illness, or condition identified through a screening examination. § 441.56(c) requires diagnosis and treatment of vision and hearing defects, dental care and appropriate immunizations, when screening indicates the need, even if not included in the state plan.

**Check each pair: does the policy text say what the key says?**

1. **Key says:** Federal regulations define EPSDT benefits as those defined in section 1905(r)
   **Text says:** "Early and Periodic Screening, Diagnostic and Treatment (EPSDT) benefits are benefits defined in section 1905(r) of the Act."
   *42 CFR § 438.900*

2. **Key says:** Same definition in Part 440
   **Text says:** "EPSDT means benefits defined in section 1905(r) of the Act."
   *42 CFR § 440.395*

3. **Key says:** 42 CFR 440.40(b) defines EPSDT and refers to subpart B of Part 441
   **Text says:** "(b) EPSDT. “Early and periodic screening and diagnosis and treatment” means— (1) Screening and diagnostic services to determine physical or mental defects in beneficiaries under age 21; and (2) Health care, treatment, and other measures to correct or ameliorate any defects and chronic conditions discovered. (See subpart B of part 441 of this chapter.)"
   *42 CFR § 440.40*

4. **Key says:** NC clinical coverage policies cite section 1905(r) as 42 U.S.C. 1396d(r), the federal EPSDT requirement
   **Text says:** "42 U.S.C. § 1396d(r) [1905(r) of the Social Security Act] Early and Periodic Screening, Diagnostic, and Treatment (EPSDT) is a federal Medicaid requirement"
   *Policy 10A (Outpatient Specialized Therapies), 2.2.1*

5. **Key says:** What the NC policies say 42 U.S.C. 1396d(r) requires: coverage of medically necessary services to correct or ameliorate a condition, for beneficiaries under 21 (attributed to the policies in the answer)
   **Text says:** "requires the state Medicaid agency to cover services, products, or procedures for Medicaid beneficiary under 21 years of age if the service is medically necessary health care to correct or ameliorate a defect, physical or mental illness, or a condition [health problem] identified through a screening examination"
   *Policy 10A (Outpatient Specialized Therapies), 2.2.1*

6. **Key says:** statutory sections the regulation implements; State plan requirement for screening and diagnosis under age 21
   **Text says:** "This subpart implements sections 1902(a)(43) and 1905(a)(4)(B) of the Social Security Act, by prescribing State plan requirements for providing early and periodic screening and diagnosis of eligible Medicaid beneficiaries under age 21"
   *42 CFR § 441.50*

7. **Key says:** treatment is part of the requirement
   **Text says:** "providing treatment to correct or ameliorate defects and chronic conditions found"
   *42 CFR § 441.50*

8. **Key says:** the subpart sets State plan requirements for EPSDT services
   **Text says:** "A State plan must provide that the Medicaid agency meets the requirements of §§ 441.56-441.62, with respect to EPSDT services"
   *42 CFR § 441.55*

9. **Key says:** vision, hearing and dental care required when indicated by screening even if not in the state plan
   **Text says:** "the agency must provide to eligible EPSDT beneficiaries, the following services, the need for which is indicated by screening, even if the services are not included in the plan— (1) Diagnosis of and treatment for defects in vision and hearing, including eyeglasses and hearing aids; (2) Dental care"
   *42 CFR § 441.56*

10. **Key says:** immunizations are among those services
   **Text says:** "(3) Appropriate immunizations."
   *42 CFR § 441.56*

<details><summary>Original key and what was wrong with it</summary>

EPSDT is established by Section 1905(r) of the Social Security Act (42 USC § 1396d(r)) and implemented in 42 CFR Part 441 Subpart B (§§ 441.50–441.62). It requires state Medicaid programs to provide comprehensive preventive, diagnostic, and treatment services for Medicaid-eligible children under 21, including any medically necessary service that could be covered under Medicaid even if that service is not included in the state plan for adults.

- 'Established by' section 1905(r): Social Security Act text is not in the corpus. What the corpus has is federal regulations defining EPSDT benefits as those defined in section 1905(r) (42 CFR 438.900, 440.395) and the NC policies' citation of 42 U.S.C. 1396d(r), so the claim is restated in those terms.
- 'Any medically necessary service that could be covered under Medicaid even if that service is not included in the state plan for adults': no federal section in the corpus says this; 441.56(c) applies 'even if the services are not included in the plan' only to vision and hearing, dental care and immunizations. The medical-necessity mandate appears only in the NC policies' description of the statute.
- The range '§§ 441.50–441.62' is not stated in any section's text (441.55 gives §§ 441.56-441.62), and 441.50 names sections 1902(a)(43) and 1905(a)(4)(B), not 1905(r), as what the subpart implements. The label 'subpart B of part 441' is supported, by 42 CFR 440.40(b).

</details>
