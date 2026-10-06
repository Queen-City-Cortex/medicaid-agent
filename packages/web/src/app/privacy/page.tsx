import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CONVERSATION_RETENTION_DAYS,
  FEEDBACK_RETENTION_DAYS,
  RATE_LIMIT_RETENTION_HOURS,
  USAGE_RETENTION_DAYS,
} from '@nc-medicaid/contracts';
import { LegalShell } from '@/components/LegalShell';
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — NC Medicaid Navigator',
  description: 'How NC Medicaid Navigator collects, uses, and stores your data.',
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This policy describes what NC Medicaid Navigator (operated by Queen City Cortex LLC)
        collects, why, where it goes, and what control you have over it. The short version: we
        store your account details and your conversations so the product works, we send your
        questions to AI providers to generate answers, and we don&rsquo;t sell or advertise with
        any of it.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> Your name, email address, and sign-in metadata,
          managed by our authentication provider, WorkOS.
        </li>
        <li>
          <strong>Conversations.</strong> The questions you ask, the answers generated, and the
          sources consulted are stored server-side so you can revisit your threads.
        </li>
        <li>
          <strong>Conversation summaries.</strong> In a long conversation the assistant may keep
          a condensed summary of earlier messages so it can keep answering in context. A summary
          belongs to the one conversation it was made in: it is not carried into your other
          conversations and is never shared across users.
        </li>
        <li>
          <strong>Feedback.</strong> Ratings and comments you leave on answers. When you rate an
          answer as unhelpful, our team may read your comment together with that question and
          answer to improve the service.
        </li>
        <li>
          <strong>Verification records.</strong> Each answer is checked automatically against
          the policy text it was drawn from. We keep the result of that check: whether the answer
          was released, corrected or withheld, and which of its statements the check could not
          support. Our team may read these records to investigate a wrong or withheld answer.
          They are not shown in the Service.
        </li>
        <li>
          <strong>Usage and error records.</strong> Request counts (for rate limiting and abuse
          prevention), the model and token counts of each request (for cost accounting), and
          error reports via Sentry. We do not run advertising or behavioral
          analytics, and we use no tracking cookies — only the cookies required to keep you
          signed in and remember your theme.
        </li>
      </ul>

      <h2>2. A note on sensitive information</h2>
      <p>
        The Service answers questions about published policy — it does not need names, dates of
        birth, Medicaid ID numbers, or case details to do its job. Please avoid including
        identifying information about yourself or clients in your questions. What you type is
        stored with your conversation and processed by the providers listed below.
      </p>

      <h2>3. How your data is used</h2>
      <p>
        We use your data to operate the Service: authenticate you, generate answers, persist your
        threads, enforce rate limits, fix errors, and improve answer quality. We do not sell your
        data or use it for advertising.
      </p>

      <h2>4. Who processes it</h2>
      <p>Generating an answer involves these subprocessors:</p>
      <ul>
        <li><strong>WorkOS</strong> — authentication and account management.</li>
        <li><strong>OpenAI</strong> (and <strong>Anthropic</strong>, when configured) — your question and relevant policy excerpts are sent to generate and verify answers.</li>
        <li><strong>Voyage AI</strong> — your question is embedded for search over the policy corpus.</li>
        <li><strong>Railway</strong> — hosting and storage for the application and its databases.</li>
        <li><strong>Sentry</strong> — error monitoring.</li>
      </ul>
      <p>
        These providers process data to provide their service to us and are bound by their own
        agreements with us. All inference providers we use are US-hosted.
      </p>

      <h2>5. Retention and deletion</h2>
      <ul>
        <li>
          <strong>Conversations</strong> are deleted after {CONVERSATION_RETENTION_DAYS} days
          without activity, together with their messages and any feedback left on them. Sending
          a message restarts the period. You can delete a conversation sooner from the sidebar,
          which deletes its stored messages.
        </li>
        <li>
          <strong>Conversation summaries</strong> are deleted with their conversation when it
          expires. If you delete the conversation yourself, its summary is deleted{' '}
          {CONVERSATION_RETENTION_DAYS} days after it was last updated.
        </li>
        <li>
          <strong>Deep-research runs</strong>, including their plans and reports, are deleted{' '}
          {CONVERSATION_RETENTION_DAYS} days after they last changed.
        </li>
        <li>
          <strong>Feedback</strong> is deleted after {FEEDBACK_RETENTION_DAYS} days, or sooner
          with the conversation it belongs to.
        </li>
        <li>
          <strong>Verification records</strong> are deleted {CONVERSATION_RETENTION_DAYS} days
          after they are written, or sooner with the conversation they belong to when it expires.
          If you delete the conversation yourself, its verification records are deleted with it.
        </li>
        <li>
          <strong>Usage records</strong> are deleted after {USAGE_RETENTION_DAYS} days.
        </li>
        <li>
          <strong>Rate-limit records</strong> are deleted after {RATE_LIMIT_RETENTION_HOURS} hours.
        </li>
        <li>
          <strong>Backups.</strong> A backup copy of the conversation store is taken daily and
          each copy is deleted after 30 days. Anything deleted from the live service remains in
          the backup copies made before the deletion until those copies are deleted.
        </li>
        <li>
          <strong>Error reports</strong> follow Sentry&rsquo;s retention (90 days by default).
        </li>
        <li>
          <strong>Account deletion.</strong> To delete your account and associated data entirely,
          contact us at the address below. Backup copies made before the deletion keep that data
          until they are deleted, up to 30 days later.
        </li>
      </ul>

      <h2>6. Security</h2>
      <p>
        Access to the Service requires authentication; conversations are scoped to your account
        and are not visible to other users. Data is encrypted in transit. Backups are restricted
        to operational use.
      </p>

      <h2>7. Not a HIPAA service</h2>
      <p>
        The Service is a policy research tool, not a system for managing patient or beneficiary
        records, and we are not a HIPAA business associate. Organizations subject to HIPAA should
        not submit protected health information.
      </p>

      <h2>8. Children</h2>
      <p>The Service is not directed to children under 13, and we do not knowingly collect their data.</p>

      <h2>9. Changes</h2>
      <p>
        We may update this policy; material changes will be reflected here with an updated date.
      </p>

      <h2>10. Contact</h2>
      <p>
        Privacy questions or deletion requests:{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. See also the{' '}
        <Link href="/terms">terms of use</Link>.
      </p>
    </LegalShell>
  );
}
