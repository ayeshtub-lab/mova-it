// Structured data for search engines (schema.org), as a JSON-LD script tag.
// "<" is escaped so user text (a moment's title) can't close the tag.
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />;
}
