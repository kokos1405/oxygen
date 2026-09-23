import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page heading="Σύνδεση">
        <Form method="post">
          <s-section heading="Development store">
            <s-paragraph>
              Μην συνδεθείτε στο live κατάστημα nth02c-ir.myshopify.com.
            </s-paragraph>
            <s-text-field
              name="shop"
              label="Shop domain"
              details="Development store. Όχι το live κατάστημα nth02c-ir.myshopify.com"
              value={shop}
              onChange={(event) => setShop(event.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit" variant="primary">
              Σύνδεση
            </s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
