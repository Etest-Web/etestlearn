export interface SchemaOrg {
  "@context": string;
  /**
   * One type, or several.
   *
   * An array is how schema.org says "this thing is more than one kind of
   * thing" — an LMS is both an `Organization` and an
   * `EducationalOrganization`, and naming only the second loses the
   * consumers that key off the first.
   */
  "@type": string | string[];
  [key: string]: any;
}
