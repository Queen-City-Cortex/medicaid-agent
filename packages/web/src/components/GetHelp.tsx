import { cn } from '@/lib/utils';
import { CRISIS_LINE, GET_HELP_CONTACTS } from '@/lib/get-help';

// The reviewed contacts block. It is static text, never model output, so it
// can sit inside any notice that leaves the reader with nowhere to go: a
// blocked message, a withheld answer, an error. Edit the contacts only in
// lib/get-help.ts.
export function GetHelp({ className }: { className?: string }) {
  return (
    <section
      data-testid="get-help"
      aria-label="Get help with your case"
      className={cn('text-left text-sm leading-relaxed text-foreground', className)}
    >
      <p className="font-medium">Need help with your own case?</p>
      <p className="text-muted-foreground">
        This tool cannot look at your case or change a decision. These offices can help.
      </p>
      <ul className="mt-2 space-y-2">
        {GET_HELP_CONTACTS.map((contact) => (
          <li key={contact.id} data-testid={`get-help-${contact.id}`}>
            <span className="font-medium">{contact.name}</span>
            {contact.phone && (
              <>
                {': '}
                <a href={`tel:${contact.tel}`} className="whitespace-nowrap underline underline-offset-2">
                  {contact.phone}
                </a>
              </>
            )}
            {contact.hours && <span className="text-muted-foreground"> ({contact.hours})</span>}
            <span className="block text-muted-foreground">
              {contact.description}{' '}
              <a
                href={contact.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-2"
              >
                {contact.linkLabel}
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p data-testid="get-help-crisis-line" className="mt-2 font-medium">
        {CRISIS_LINE}
      </p>
    </section>
  );
}
