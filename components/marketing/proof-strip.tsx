const FACTS = [
  {
    label: "Certificates",
    body: "Issued with a unique ID and a public page anyone can check.",
  },
  {
    label: "Payments",
    body: "Priced in naira up front and settled through Paystack.",
  },
  {
    label: "The catalog",
    body: "A person reviews every course before it reaches this page.",
  },
];

/**
 * The trust strip the hero used to carry.
 *
 * It was three icon-and-label items sitting under the hero's CTAs, which is
 * the single most predictable marketing move there is, so it moved down here
 * instead of being deleted: the facts are worth making, just not at the price
 * of a fourth line in the hero.
 *
 * Row labels are set in the display face at sentence case, not as tracked
 * small caps. The page has one eyebrow budget and this section should not
 * spend any of it.
 */
export function ProofStrip() {
  return (
    <section aria-label="How Glypha Learn handles certificates, payments and course review" className="border-b border-rule">
      <dl className="mx-auto grid max-w-6xl gap-y-8 px-4 py-12 sm:px-6 md:grid-cols-3 md:divide-x md:divide-rule md:gap-y-0 md:py-14">
        {FACTS.map(({ label, body }) => (
          <div key={label} className="md:px-8 md:first:pl-0 md:last:pr-0">
            <dt className="display-subheading text-sm">{label}</dt>
            <dd className="mt-2 max-w-[34ch] text-pretty text-sm leading-body text-muted-foreground">
              {body}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}