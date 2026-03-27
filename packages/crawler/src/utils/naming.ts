const MAX_FILENAME_LENGTH = 100;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface BuildFilenameOptions {
  policyNumber: string | null;
  title: string | null;
  extension: string;
  existingNames?: Set<string>;
}

export function buildFilename(options: BuildFilenameOptions): string {
  const { policyNumber, title, extension, existingNames } = options;

  let base: string;
  if (policyNumber && title) {
    base = `${slugify(policyNumber)}_${slugify(title)}`;
  } else if (policyNumber) {
    base = slugify(policyNumber);
  } else if (title) {
    base = slugify(title);
  } else {
    base = 'unknown-document';
  }

  const maxBase = MAX_FILENAME_LENGTH - extension.length;
  if (base.length > maxBase) {
    base = base.substring(0, maxBase).replace(/-$/, '');
  }

  let filename = `${base}${extension}`;

  if (existingNames) {
    let counter = 2;
    while (existingNames.has(filename)) {
      const suffix = `_${counter}`;
      const truncBase = base.substring(
        0,
        maxBase - suffix.length,
      ).replace(/-$/, '');
      filename = `${truncBase}${suffix}${extension}`;
      counter++;
    }
  }

  return filename;
}
