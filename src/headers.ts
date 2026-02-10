/**
 * Custom headers used by the EnhanceForm component for progressive enhancement.
 * @constant
 */
export const EnhancedHeader = {
  /** Response header. Will cause the browser to go to url via window.location.assign */
  Redirect: "X-Enhance-Redirect",
  /** Request header. Indicates a full submit.  */
  Submit: "X-Enhance-Submit",
  /** Request header. Indicates that we're only interested in doing a validation */
  Validate: "X-Enhance-Validate",
} as const;

export type EnhancedFormHeader = (typeof EnhancedHeader)[keyof typeof EnhancedHeader];
