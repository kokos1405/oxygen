import type { LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded={false}>
      <s-page heading="Oxygen Pelatologio">
        <s-section heading="Γέφυρα Shopify → Oxygen">
          <s-paragraph>
            Συγχρονισμός Shopify → Oxygen Pelatologio (sandbox). Τα παραστατικά
            εκδίδονται στο Oxygen. Η εφαρμογή ανοίγει μέσα στο Shopify Admin.
          </s-paragraph>
          <s-paragraph>
            Μην εγκαταστήσετε την εφαρμογή στο live κατάστημα
            nth02c-ir.myshopify.com. Χρησιμοποιήστε development store και πάρτε
            έγκριση του εμπόρου πριν από οποιοδήποτε live deploy.
          </s-paragraph>
          {showForm && (
            <Form method="post" action="/auth/login">
              <s-text-field
                name="shop"
                label="Shop domain"
                details="Development store. Όχι το live κατάστημα nth02c-ir.myshopify.com"
                autocomplete="on"
              ></s-text-field>
              <s-button type="submit" variant="primary">
                Σύνδεση
              </s-button>
            </Form>
          )}
        </s-section>
      </s-page>
    </AppProvider>
  );
}
