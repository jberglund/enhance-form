# enhance-form

A custom element that progressively enhances HTML forms with AJAX submission, per-field validation, and targeted DOM updates.

Without JavaScript the form works as a normal HTML form. With JavaScript, `<enhance-form>` intercepts submissions and validation, swapping parts of the page with the server response.

## Install

```
npm install enhance-form
```

## Usage

Import the package to register the `<enhance-form>` custom element:

```js
import "enhance-form";
```

Wrap a `<form>` element:

```html
<enhance-form target="#result" fail-target="#errors">
  <form action="/submit" method="POST">
    <fieldset enhance-form-group>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" enhance-validate />
    </fieldset>

    <fieldset enhance-form-group>
      <label for="name">Name</label>
      <input id="name" name="name" type="text" enhance-validate />
    </fieldset>

    <button type="submit">Submit</button>
  </form>
</enhance-form>

<div id="result"></div>
<div id="errors"></div>
```

## Attributes

### `<enhance-form>`

| Attribute     | Description                                                                 |
| ------------- | --------------------------------------------------------------------------- |
| `target`      | CSS selector for the element to replace with the response on success (200). |
| `fail-target` | CSS selector for the element to replace on server errors (5XX). Defaults to `target`. |

### On child elements

| Attribute            | Used on                  | Description                                                        |
| -------------------- | ------------------------ | ------------------------------------------------------------------ |
| `enhance-form-group` | `<fieldset>` or any element | Groups an input with its label and validation messages. Used to scope per-field validation replacement. |
| `enhance-validate`   | `<input>`, `<textarea>`  | Enables per-field validation on blur.                              |

## How it works

### Per-field validation (blur)

When a user blurs an input with the `enhance-validate` attribute:

1. The component POSTs the full form data to the form's `action` URL.
2. A `X-Enhance-Validate` request header is sent with the field name as its value.
3. The server responds with HTML containing the form (with validation state).
4. The component extracts the matching `[enhance-form-group]` or `<fieldset>` that contains the validated field and replaces only that group in the DOM.

Empty fields are skipped. Concurrent validation requests for the same field are aborted automatically.

### Form submission

When the form is submitted:

1. Default submission is prevented.
2. Any in-flight per-field validation requests are aborted.
3. The component POSTs the form data with a `X-Enhance-Submit` request header.
4. The response is handled based on the status code:

| Status | Behavior |
| ------ | -------- |
| **200** | The element matching `target` is replaced with the corresponding element from the response. Uses the View Transitions API if available. |
| **4XX** | The `<form>` is replaced with the form from the response (expected to contain validation errors). The first input with `aria-invalid="true"` is focused. |
| **5XX** | The element matching `fail-target` is replaced with the corresponding element from the response. |

If the response includes an `X-Enhance-Redirect` header, the browser navigates to that URL via `window.location.assign`.

## Server contract

The server must inspect the custom request headers to determine what kind of request it's handling and respond accordingly.

### Request headers

| Header               | Value        | Meaning                                         |
| -------------------- | ------------ | ------------------------------------------------ |
| `X-Enhance-Submit`   | `"form"`     | This is a full form submission via the component. |
| `X-Enhance-Validate` | Field `name` | This is a validation-only request for a single field. |

When neither header is present, treat it as a normal (non-JS) form submission.

### Response expectations

The server should always respond with **HTML**.

**On validation requests** (`X-Enhance-Validate`):

Return the full form markup. The component will extract the relevant form group itself. Include any validation errors or `aria-invalid` attributes on the validated field.

**On submit requests** (`X-Enhance-Submit`):

| Status | What to return |
| ------ | -------------- |
| **200** | HTML containing an element matching the `target` selector (the success state). |
| **4XX** | HTML containing the `<form>` with validation errors. Mark invalid inputs with `aria-invalid="true"`. |
| **5XX** | HTML containing an element matching the `fail-target` selector (the error state). |

### Response headers

| Header               | Value | Effect                                          |
| -------------------- | ----- | ------------------------------------------------ |
| `X-Enhance-Redirect` | URL   | The browser will navigate to this URL instead of updating the DOM. |

### Accessing headers in code

The package exports the header names as constants:

```js
import { EnhancedHeader } from "enhance-form";

EnhancedHeader.Submit   // "X-Enhance-Submit"
EnhancedHeader.Validate // "X-Enhance-Validate"
EnhancedHeader.Redirect // "X-Enhance-Redirect"
```

## Server example

A minimal Express handler:

```js
import { EnhancedHeader } from "enhance-form";

app.post("/submit", (req, res) => {
  const isEnhancedSubmit = req.headers[EnhancedHeader.Submit.toLowerCase()];
  const validateField = req.headers[EnhancedHeader.Validate.toLowerCase()];

  const errors = validate(req.body);

  if (validateField) {
    // Return the form with validation state for the field
    return res.status(errors ? 422 : 200).send(renderForm(req.body, errors));
  }

  if (errors) {
    return res.status(422).send(renderForm(req.body, errors));
  }

  if (isEnhancedSubmit) {
    // Return just the success content that matches the target selector
    return res.send('<div id="result"><p>Saved.</p></div>');
  }

  // Non-JS fallback: normal redirect
  res.redirect("/success");
});
```

## License

MIT