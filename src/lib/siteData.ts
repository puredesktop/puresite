/**
 * Records a static site can hold.
 *
 * A site that takes a form, runs a poll, or keeps a checklist needs somewhere
 * to put what people send it. Some hosts provide exactly that: you declare
 * collections in a manifest that ships with the site, and the browser posts
 * to them directly.
 *
 * The model here is the app's own — collections, fields, who may do what —
 * and a provider turns it into whatever manifest that host reads. here.now is
 * the first; the shape of this file is the bet that the second will differ in
 * its manifest and not in its concepts, because "a named collection of typed
 * fields, with rules about who can read and write" is not a here.now idea.
 *
 * What is deliberately NOT here: any notion of a schema migration. Records
 * live on the host and this app never sees them. Changing a field changes
 * what future records may contain, and the host decides what that means for
 * the ones already stored.
 */

/** Types every provider is expected to understand. */
export const FIELD_TYPES = [
  'string',
  'number',
  'integer',
  'boolean',
  'url',
  'email',
  'datetime',
  'array',
  'object',
] as const

export type FieldType = (typeof FIELD_TYPES)[number]

/** Who may do a thing: anyone, only the owner, or nobody. */
export type AccessLevel = 'public' | 'owner' | 'none'

export interface CollectionField {
  name: string
  type: FieldType
  required?: boolean
  /** Strings, arrays and objects take a size cap. */
  maxLength?: number
  /** Numbers take bounds. */
  minimum?: number
  maximum?: number
  /** Strings only: strip surrounding whitespace before storing. */
  trim?: boolean
}

export interface CollectionAccess {
  read: AccessLevel
  insert: AccessLevel
  update: AccessLevel
  delete: AccessLevel
}

export interface Collection {
  name: string
  fields: CollectionField[]
  access: CollectionAccess
  /** "<n>/hour/ip" or "<n>/minute/ip". */
  rateLimit?: string
}

/**
 * The safe default: anyone may submit, only you may read back.
 *
 * A form is the common case, and a form that anyone can read is a data
 * leak waiting to happen — a feedback box whose contents are a public URL
 * away. Publishing is the deliberate act; making the results public should
 * be too.
 */
export function defaultAccess(): CollectionAccess {
  return { read: 'owner', insert: 'public', update: 'owner', delete: 'owner' }
}

/**
 * Names a host will accept.
 *
 * Lowercase identifier, because that is what the manifest formats agree on
 * and what reads sensibly in a URL path.
 */
export const NAME_PATTERN = /^[a-z][a-z0-9_]*$/

/** Field names the host uses for its own bookkeeping. */
export const RESERVED_FIELDS = [
  'id',
  'site_slug',
  'collection',
  'data',
  'status',
  'created_at',
  'updated_at',
  'created_by_account_id',
]

export const LIMITS = {
  collections: 10,
  fieldsPerCollection: 50,
  nameLength: 64,
  manifestBytes: 64 * 1024,
}

export interface DataFinding {
  severity: 'error' | 'warning'
  code: string
  message: string
  fix: string
  collection?: string
}

/**
 * What a host will refuse, said before it refuses it.
 *
 * A manifest that fails validation fails the whole publish, so every rule
 * the provider documents is checked here rather than discovered at the end
 * of an upload.
 */
export function checkCollections(collections: Collection[]): DataFinding[] {
  const findings: DataFinding[] = []

  if (collections.length > LIMITS.collections) {
    findings.push({
      severity: 'error',
      code: 'too-many-collections',
      message: `${collections.length} collections — the limit is ${LIMITS.collections}`,
      fix: 'remove some, or combine them',
    })
  }

  const seen = new Set<string>()
  for (const collection of collections) {
    const where = collection.name

    if (!NAME_PATTERN.test(collection.name)) {
      findings.push({
        severity: 'error',
        code: 'bad-collection-name',
        message: `"${collection.name}" is not a usable collection name`,
        fix: 'start with a letter, then lowercase letters, digits or underscores',
        collection: where,
      })
    }
    if (collection.name.length > LIMITS.nameLength) {
      findings.push({
        severity: 'error',
        code: 'long-collection-name',
        message: `"${collection.name}" is longer than ${LIMITS.nameLength} characters`,
        fix: 'shorten it',
        collection: where,
      })
    }
    if (seen.has(collection.name)) {
      findings.push({
        severity: 'error',
        code: 'duplicate-collection',
        message: `there are two collections called "${collection.name}"`,
        fix: 'rename one',
        collection: where,
      })
    }
    seen.add(collection.name)

    if (!collection.fields.length) {
      findings.push({
        severity: 'warning',
        code: 'no-fields',
        message: `"${collection.name}" has no fields`,
        fix: 'add at least one, or nothing can be stored in it',
        collection: where,
      })
    }
    if (collection.fields.length > LIMITS.fieldsPerCollection) {
      findings.push({
        severity: 'error',
        code: 'too-many-fields',
        message: `"${collection.name}" has ${collection.fields.length} fields — the limit is ${LIMITS.fieldsPerCollection}`,
        fix: 'remove some',
        collection: where,
      })
    }

    const fieldNames = new Set<string>()
    for (const field of collection.fields) {
      if (!NAME_PATTERN.test(field.name)) {
        findings.push({
          severity: 'error',
          code: 'bad-field-name',
          message: `"${field.name}" in ${collection.name} is not a usable field name`,
          fix: 'start with a letter, then lowercase letters, digits or underscores',
          collection: where,
        })
      }
      if (RESERVED_FIELDS.includes(field.name)) {
        findings.push({
          severity: 'error',
          code: 'reserved-field',
          message: `"${field.name}" is reserved — the host uses it for its own bookkeeping`,
          fix: `name it something else, such as "${field.name}_value"`,
          collection: where,
        })
      }
      if (fieldNames.has(field.name)) {
        findings.push({
          severity: 'error',
          code: 'duplicate-field',
          message: `${collection.name} has two fields called "${field.name}"`,
          fix: 'rename one',
          collection: where,
        })
      }
      fieldNames.add(field.name)
    }

    if (collection.rateLimit && !/^\d+\/(hour|minute)\/ip$/.test(collection.rateLimit)) {
      findings.push({
        severity: 'error',
        code: 'bad-rate-limit',
        message: `"${collection.rateLimit}" is not a rate limit the host accepts`,
        fix: 'use "<number>/hour/ip" or "<number>/minute/ip"',
        collection: where,
      })
    }

    // Public writes that anyone can also rewrite is a different decision from
    // public submission, and worth saying out loud rather than discovering.
    if (collection.access.update === 'public' || collection.access.delete === 'public') {
      findings.push({
        severity: 'warning',
        code: 'public-mutation',
        message: `anyone can change or remove records in "${collection.name}"`,
        fix: 'only leave this on for data that tolerates public edits',
        collection: where,
      })
    }
    if (collection.access.read === 'public' && collection.access.insert === 'public') {
      findings.push({
        severity: 'warning',
        code: 'public-read-and-write',
        message: `anything submitted to "${collection.name}" is readable by anyone`,
        fix: 'set read to owner unless the records are meant to be public',
        collection: where,
      })
    }
  }

  return findings
}

/** A provider that can store records for a published site. */
export interface DataProvider {
  id: string
  /** Where the manifest goes inside the package. */
  manifestPath: string
  render: (collections: Collection[]) => string
  /** The URL a browser posts a record to, relative to the site. */
  submitPath: (collection: string) => string
  /** True when this host needs an account before records work at all. */
  requiresAccount: boolean
  /** Said in the UI when it does. */
  accountNote?: string
}

/**
 * here.now's Site Data.
 *
 * Public inserts are allowed when the request Origin matches the site, which
 * is what makes a form work with no key in the page — the one fact the whole
 * feature rests on.
 */
export const HERENOW_DATA: DataProvider = {
  id: 'herenow',
  manifestPath: '.herenow/data.json',
  requiresAccount: true,
  accountNote:
    'Records need an account-owned site. An anonymous site answers 403 until it is claimed.',
  submitPath: collection => `/api/data/${collection}`,
  render: collections => {
    const out: Record<string, unknown> = {}
    for (const collection of collections) {
      const fields: Record<string, unknown> = {}
      for (const field of collection.fields) {
        const spec: Record<string, unknown> = { type: field.type }
        if (field.required) spec.required = true
        if (field.maxLength !== undefined) spec.maxLength = field.maxLength
        if (field.minimum !== undefined) spec.minimum = field.minimum
        if (field.maximum !== undefined) spec.maximum = field.maximum
        if (field.trim) spec.trim = true
        fields[field.name] = spec
      }
      const entry: Record<string, unknown> = { fields, access: collection.access }
      if (collection.rateLimit) entry.rateLimit = collection.rateLimit
      // The host's own double opt-in: public update or delete is not enough
      // on its own, and leaving this off is what keeps an accident harmless.
      if (
        collection.access.update === 'public' ||
        collection.access.delete === 'public'
      ) {
        entry.publicMutation = 'open'
      }
      out[collection.name] = entry
    }
    // An omitted manifest preserves whatever the host already has, so turning
    // data off has to be said explicitly rather than by leaving it out.
    return `${JSON.stringify({ collections: out }, null, 2)}\n`
  },
}

export const DATA_PROVIDERS: DataProvider[] = [HERENOW_DATA]

export function dataProviderFor(serviceId: string): DataProvider | undefined {
  return DATA_PROVIDERS.find(provider => serviceId.replace(/[^a-z]/gi, '').includes(provider.id))
}

/** Read the app's model back out of a manifest a package already carries. */
export function parseCollections(text: string): Collection[] {
  try {
    const parsed = JSON.parse(text) as {
      collections?: Record<string, unknown>
    }
    const source = parsed.collections ?? {}
    return Object.entries(source).map(([name, raw]) => {
      const entry = raw as {
        fields?: Record<string, Record<string, unknown>>
        access?: Partial<CollectionAccess>
        rateLimit?: string
      }
      return {
        name,
        fields: Object.entries(entry.fields ?? {}).map(([fieldName, spec]) => ({
          name: fieldName,
          type: (FIELD_TYPES as readonly string[]).includes(String(spec.type))
            ? (spec.type as FieldType)
            : 'string',
          ...(spec.required ? { required: true } : {}),
          ...(typeof spec.maxLength === 'number' ? { maxLength: spec.maxLength } : {}),
          ...(typeof spec.minimum === 'number' ? { minimum: spec.minimum } : {}),
          ...(typeof spec.maximum === 'number' ? { maximum: spec.maximum } : {}),
          ...(spec.trim ? { trim: true } : {}),
        })),
        access: { ...defaultAccess(), ...(entry.access ?? {}) },
        ...(entry.rateLimit ? { rateLimit: entry.rateLimit } : {}),
      }
    })
  } catch {
    return []
  }
}

/**
 * A form that posts to a collection, ready to paste into a page.
 *
 * Generated rather than hand-written because the endpoint, the field names
 * and the types all come from the collection — a form that disagrees with
 * its collection fails validation at the host, after the visitor has typed.
 *
 * No key is involved and none may be: public insert is allowed because the
 * request Origin matches the site, which is exactly why this can live in a
 * page that anyone can view.
 */
export function formSnippetFor(
  collection: Collection,
  provider: DataProvider,
): string {
  const inputFor = (field: CollectionField): string => {
    const required = field.required ? ' required' : ''
    const type =
      field.type === 'email'
        ? 'email'
        : field.type === 'url'
          ? 'url'
          : field.type === 'number' || field.type === 'integer'
            ? 'number'
            : field.type === 'datetime'
              ? 'datetime-local'
              : field.type === 'boolean'
                ? 'checkbox'
                : 'text'
    const label = field.name.replace(/_/g, ' ')
    const cap = field.maxLength ? ` maxlength="${field.maxLength}"` : ''
    const step = field.type === 'integer' ? ' step="1"' : ''
    const bounds = [
      field.minimum !== undefined ? ` min="${field.minimum}"` : '',
      field.maximum !== undefined ? ` max="${field.maximum}"` : '',
    ].join('')
    if (field.maxLength && field.maxLength > 200 && field.type === 'string') {
      return `      <label>${label}\n        <textarea name="${field.name}"${required}${cap}></textarea>\n      </label>`
    }
    return `      <label>${label}\n        <input type="${type}" name="${field.name}"${required}${cap}${step}${bounds} />\n      </label>`
  }

  const numeric = collection.fields
    .filter(field => field.type === 'number' || field.type === 'integer')
    .map(field => field.name)
  const booleans = collection.fields
    .filter(field => field.type === 'boolean')
    .map(field => field.name)

  return `<form class="site-data-form" data-collection="${collection.name}">
  <fieldset>
${collection.fields.map(inputFor).join('\n')}
  </fieldset>
  <button type="submit">Send</button>
  <p class="site-data-status" role="status" aria-live="polite"></p>
</form>

<script>
  (function () {
    var form = document.currentScript.previousElementSibling;
    while (form && form.tagName !== 'FORM') form = form.previousElementSibling;
    if (!form) return;
    var status = form.querySelector('.site-data-status');
    var numeric = ${JSON.stringify(numeric)};
    var booleans = ${JSON.stringify(booleans)};
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var record = {};
      new FormData(form).forEach(function (value, key) { record[key] = value; });
      // Checkboxes are absent rather than false when unticked, and the host
      // validates types — so both are settled here, not on the server.
      booleans.forEach(function (name) { record[name] = form.elements[name].checked; });
      numeric.forEach(function (name) {
        if (record[name] !== undefined && record[name] !== '') record[name] = Number(record[name]);
      });
      status.textContent = 'Sending…';
      fetch('${provider.submitPath(collection.name)}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      }).then(function (response) {
        if (!response.ok) throw new Error('Status ' + response.status);
        form.reset();
        status.textContent = 'Thank you — that has been sent.';
      }).catch(function () {
        status.textContent = 'That did not send. Please try again.';
      });
    });
  })();
</script>
`
}

/**
 * Whether the Data tab has anything to say.
 *
 * Not "can this host store records" — that is true of every here.now site,
 * so it would put a tab on every site that is only pages, which is most of
 * them. The tab appears when the site is actually trying to collect
 * something: a collection already exists, or a page has a form and therefore
 * somewhere for it to go is a live question.
 */
export function siteNeedsData(input: {
  pages: Record<string, string>
  collections: Collection[]
}): boolean {
  if (input.collections.length > 0) return true
  return Object.values(input.pages).some(html => /<form[\s>]/i.test(html))
}
