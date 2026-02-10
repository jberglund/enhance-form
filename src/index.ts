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

const parser = new DOMParser();

/**
 * A custom web component that progressively enhances HTML forms with AJAX submission,
 * client-side validation, and targeted DOM updates.
 *
 * @class EnhanceForm
 * @extends HTMLElement
 *
 * @example
 * ```html
 * <enhance-form target="#results" fail-target="#error-container">
 *   <form action="/submit" method="POST">
 *     <fieldset enhance-form-group>
 *      <input name="email" enhance-validate />
 *     </fieldset>
 *     <button type="submit">Submit</button>
 *   </form>
 * </enhance-form>
 * ```
 *
 * @attr {string} target - CSS selector for the element to replace on successful submission
 * @attr {string} fail-target - CSS selector for the element to replace on server errors (defaults to target)
 */
class EnhanceForm extends HTMLElement {
  /** The custom element tag name */
  static tagName = "enhance-form";

  /** The form element contained within this component */
  private _form: HTMLFormElement;

  /** CSS selector for the target element to update on success */
  private _targetSelector: string;

  /** CSS selector for the target element to update on failure */
  private _failTargetSelector: string;

  /** Map of abort controllers for managing concurrent requests */
  private controllers: Map<string, AbortController> = new Map();

  /**
   * Creates an instance of EnhanceForm.
   * @throws {Error} If no form element is found within the component
   */
  constructor() {
    super();
    const form = this.querySelector("form");
    this._targetSelector = this.getAttribute("target") || "";
    this._failTargetSelector =
      this.getAttribute("fail-target") || this.getAttribute("target") || "";
    if (!form) {
      throw new Error("No form found in <enhance-form>");
    }
    this._form = form;
  }

  /**
   * Handles individual input field validation on blur events.
   * Sends an AJAX request to validate the field and updates the UI with the response.
   *
   * @param {Event} event - The blur event from the input field
   * @returns {Promise<void>}
   *
   * @remarks
   * - Skips validation for empty inputs
   * - Aborts any pending validation requests for the same field
   * - Updates only the form group containing the validated input
   */
  async handleInputValidation(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    // If the input is empty, we don't want to validate it.
    if (target.value === "") return;
    this.controllers.get(target.name)?.abort("Aborted by user");
    this.controllers.set(target.name, new AbortController());
    const signal = this.controllers.get(target.name)?.signal;
    const groupSelector = `:is([enhance-form-group], fieldset):has([name="${target.name}"])`;

    try {
      const headers = addHeader(EnhancedHeader.Validate, target.name);

      const { html } = await this.requestForm(headers, signal);
      if (!html) return;

      const newFormGroup = this.replaceElements(html, groupSelector);
      const newValidateInput = newFormGroup?.querySelector<HTMLInputElement>(
        ":is(input, textarea)[enhance-validate]",
      );

      if (newValidateInput) {
        this.bindEvents(newValidateInput);
      }
    } catch (error) {
      console.warn("Form validation:", error);
    }
  }

  /**
   * Handles form submission with AJAX.
   * Prevents default form submission and handles the response based on status codes.
   *
   * @remarks
   * Response handling:
   * - 200: Updates the target element with the response
   * - 4XX: Replaces the form with validation errors
   * - 5XX: Updates the fail-target element
   * - Redirect header: Navigates to the specified URL
   */
  async handleFormValidation(event: Event) {
    event.preventDefault();

    try {
      // abort any individual input validation requests.
      this.controllers.forEach((controller) => {
        controller.abort();
      });
      this.controllers.set("form", new AbortController());

      const { html, response } = await this.requestForm(
        addHeader(EnhancedHeader.Submit, "form"),
        this.controllers.get("form")?.signal,
      );

      if (getHeader(response, EnhancedHeader.Redirect) !== null) {
        this.handleRedirect(response);
      }

      if (!html) return;

      // We expect the same form to be returned with all 4XX errors.
      if (response.status >= 400 && response.status <= 499) {
        const newForm = this.replaceElements(html, "form");
        this._form = newForm as HTMLFormElement;

        this.bindEvents();
      }

      // We do NOT expect the same form to be returned with 5XX errors.
      if (response.status >= 500 && response.status <= 599) {
        this.replaceElements(html, this._failTargetSelector, this);
      }

      if (response.status === 200) {
        const target =
          this.closest(this._targetSelector) !== null ? this.closest(this._targetSelector) : this;
        viewTransition(() => this.replaceElements(html, this._targetSelector, target));
      }

      return Promise.resolve();
    } catch (error) {
      console.warn("Form validation:", error);
    }
  }

  /**
   * Handles redirect responses by navigating to the specified URL.
   *
   * @param {Response} response - The fetch response containing redirect headers
   * @private
   */
  private handleRedirect(response: Response) {
    const redirectString = getHeader(response, EnhancedHeader.Redirect) as string;

    if (!redirectString) return;
    window.location.assign(redirectString);
  }

  /**
   * Focuses the first input field with validation errors after form submission.
   * Also positions the cursor at the end of the input value if possible.
   *
   * @private
   */
  private focusFirstInvalidInput() {
    const firstInvalidInput = this._form.querySelector<HTMLInputElement>(
      ':is(input, textarea)[aria-invalid="true"]',
    );

    if (!firstInvalidInput) return;
    firstInvalidInput.focus();

    // If possible, put cursor at the end of the focused input
    if ("setSelectionRange" in firstInvalidInput) {
      (firstInvalidInput as HTMLInputElement).setSelectionRange(-1, -1);
    }
  }

  /**
   * Sends a POST request to the form action URL with the form data.
   *
   * @param {Headers} [headers] - Optional headers to include in the request
   * @param {AbortSignal} [signal] - Optional abort signal for cancelling the request
   * @returns {Promise<{response: Response, html: Document | null}>} The response and parsed HTML
   * @private
   *
   * @remarks
   * - Automatically redirects for external URLs
   * - Parses the response as HTML
   */
  private async requestForm(
    headers?: Headers,
    signal?: AbortSignal,
  ): Promise<{ response: Response; html: Document | null }> {
    const response = await fetch(this._form.action, {
      method: "POST",
      headers,
      body: new FormData(this._form),
      signal,
    });

    if (response.redirected && !isInternalUrl(response.url)) {
      window.location.assign(response.url);

      return { response, html: null };
    }
    const html = parser.parseFromString(await response.text(), "text/html");
    return { response, html };
  }

  /**
   * Replaces an element in the DOM with a new element from the response HTML.
   *
   * @param {Document} html - The parsed HTML document from the server response
   * @param {string} selector - CSS selector for the element to replace
   * @param {Element | null} [replaceRootElement] - Optional root element to search within
   * @returns {Element | null} The new element that was inserted, or null if replacement failed
   * @private
   */
  private replaceElements(
    html: Document,
    selector: string,
    replaceRootElement?: Element | null,
  ): Element | null {
    const newElement = html.querySelector(selector);
    const currentElement = replaceRootElement || this.querySelector(selector);

    if (newElement && currentElement) {
      currentElement.replaceWith(newElement);
      return newElement;
    }

    return null;
  }

  /**
   * Binds event listeners to form inputs and the form itself.
   *
   * @param {HTMLInputElement} [target] - Optional specific input to bind events to
   * @private
   *
   * @remarks
   * - If target is provided, only binds blur event to that input
   * - Otherwise, binds submit event to form and blur events to all inputs with enhance-validate attribute
   */
  private bindEvents(target?: HTMLInputElement) {
    const blurHandler = (event: Event) => {
      this.handleInputValidation(event);
    };

    if (target) {
      target.addEventListener("blur", blurHandler);
      return;
    }

    this._form.addEventListener("submit", async (event) => {
      await this.handleFormValidation(event);
      this.focusFirstInvalidInput();
    });

    const inputs = this._form.querySelectorAll<HTMLInputElement>(
      ":is(input, textarea)[enhance-validate]",
    );

    for (const input of inputs) {
      input.addEventListener("blur", blurHandler);
    }
  }

  connectedCallback() {
    this.bindEvents();
  }
}

/**
 * Wraps a DOM update function in a view transition if supported by the browser.
 * Falls back to immediate execution if View Transitions API is not available.
 *
 * @param {() => void} fn - The function to execute during the view transition
 */
function viewTransition(fn: () => void) {
  if (!document.startViewTransition) {
    fn();
  } else {
    document.startViewTransition(() => fn());
  }
}

const isInternalUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    return urlObj.origin === window.location.origin;
  } catch {
    return true; // Relative URLs are considered internal
  }
};

const addHeader = (name: EnhancedFormHeader, value: string) => {
  const headers = new Headers();
  headers.append(name, value);
  return headers;
};

const getHeader = (response: Response, name: EnhancedFormHeader) => response.headers.get(name);

// Register the custom element if not already defined
if (!customElements.get(EnhanceForm.tagName)) {
  customElements.define(EnhanceForm.tagName, EnhanceForm);
}
