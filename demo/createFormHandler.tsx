import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import type { FC } from "hono/jsx";
import { z } from "zod";

/**
 * Checks if the request is an inline validation request (Unpoly or x-enhance)
 */
export const isInlineValidation = (c: Context) =>
  !!c.req.header("X-Up-Validate") || !!c.req.header("X-Enhance-Validate");

/**
 * Result of the onSubmit callback
 * - `{ redirect: string }` - Redirect to the given path on success
 * - `{ error: string }` - Re-render form with error message
 * - `Response` - Full control escape hatch for edge cases
 */
type OnSubmitResult = { redirect: string } | { error: string } | Response;

export type FormProps<TSchema extends z.ZodType> = {
  data?: z.infer<TSchema>;
  errors?: z.ZodFlattenedError<z.infer<TSchema>>;
  formError?: string;
};

/**
 * Configuration for creating a form handler
 */
type FormHandlerConfig<TSchema extends z.ZodType> = {
  /** Zod schema for form validation */
  schema: TSchema;
  /** Form component to render */
  form: FC<FormProps<TSchema>>;
  /**
   * Async callback called after validation passes (and not inline validation).
   * Use this for API calls, database operations, etc.
   *
   * @param data - The validated form data
   * @param c - The Hono context (for accessing headers, cookies, etc.)
   * @returns Promise resolving to redirect path, error message, or full Response
   *
   * @example
   * ```tsx
   * onSubmit: async (data, c) => {
   *   try {
   *     await api.createUser(data);
   *     return { redirect: "/users/success" };
   *   } catch (err) {
   *     return { error: "Failed to create user" };
   *   }
   * }
   * ```
   */
  onSubmit: (data: z.infer<TSchema>, c: Context) => Promise<OnSubmitResult>;
};

/**
 * Creates a GET handler that renders the form
 */
export function createGetHandler<TSchema extends z.ZodType>(
  Form: FormHandlerConfig<TSchema>["form"],
) {
  return (c: Context) => c.render(<Form />);
}

/**
 * Creates a POST handler with Zod validation that:
 * - Re-renders the form with errors on validation failure (422)
 * - Re-renders the form without errors for Unpoly inline validation
 * - Calls onSubmit for async operations (API calls, DB writes, etc.)
 * - Handles redirect/error/Response based on onSubmit result
 */
export function createPostHandler<TSchema extends z.ZodType>({
  schema,
  form: Form,
  onSubmit,
}: FormHandlerConfig<TSchema>) {
  return zValidator("form", schema, async (result, c) => {
    // Validation failed - render form with field errors
    if (!result.success) {
      console.log(c.req.formData);
      const errors = z.flattenError(result.error);
      c.status(422);
      return c.render(<Form data={result.data} errors={errors} />);
    }

    // Inline validation (Unpoly) - just re-render without errors
    if (isInlineValidation(c)) {
      return c.render(<Form data={result.data} />);
    }

    // Run the async onSubmit callback
    const submitResult = await onSubmit(result.data, c);

    // Full Response escape hatch
    if (submitResult instanceof Response) {
      return submitResult;
    }

    // Error - re-render form with error message
    if ("error" in submitResult) {
      c.status(422);
      return c.render(
        <Form data={result.data} formError={submitResult.error} />,
      );
    }

    // Success - redirect
    return c.redirect(submitResult.redirect);
  });
}

/**
 * Creates both GET and POST handlers for a form page
 *
 * @example
 * ```tsx
 * const { get, post } = createFormHandlers({
 *   schema: mySchema,
 *   form: MyForm,
 *   onSubmit: async (data, c) => {
 *     try {
 *       await api.submitForm(data);
 *       return { redirect: "/success" };
 *     } catch (err) {
 *       return { error: "Submission failed. Please try again." };
 *     }
 *   },
 * });
 *
 * // In router.tsx:
 * router.get(template(routes.myPage), get);
 * router.post(template(routes.myPage), post);
 * ```
 */
export function createFormHandlers<TSchema extends z.ZodType>(
  config: FormHandlerConfig<TSchema>,
) {
  return {
    get: createGetHandler(config.form),
    post: createPostHandler(config),
  };
}