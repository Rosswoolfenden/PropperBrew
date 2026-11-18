/** Schema.org data for search engines, as JSON-LD. `<` is escaped so text can't close the script. */
export function StructuredData({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
