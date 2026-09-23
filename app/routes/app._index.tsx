import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import webhookTopics from "../oxygen/webhook-topics.json";
import type { ConnectionCheck } from "../services/connection.server";
import { checkOxygenConnection } from "../services/connection.server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const connection = await checkOxygenConnection();

  let lastSync: {
    topic: string;
    status: string;
    shopifyId: string | null;
    message: string | null;
    createdAt: string;
  } | null = null;
  let syncLogReady = true;

  try {
    const row = await prisma.syncEvent.findFirst({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
    });
    if (row) {
      lastSync = {
        topic: row.topic,
        status: row.status,
        shopifyId: row.shopifyId,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
      };
    }
  } catch {
    syncLogReady = false;
  }

  return {
    shop: session.shop,
    connection,
    lastSync,
    syncLogReady,
    webhooks: webhookTopics,
    inventoryWritesEnabled: Boolean(
      process.env.OXYGEN_DEFAULT_WAREHOUSE_ID?.trim(),
    ),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  return { rechecked: true };
};

export default function Index() {
  const { shop, connection, lastSync, syncLogReady, webhooks, inventoryWritesEnabled } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Oxygen Pelatologio">
      <s-section heading="Σύνδεση Oxygen">
        <s-paragraph>
          Κατάστημα: <s-text type="strong">{shop}</s-text>
        </s-paragraph>
        <ConnectionDetails connection={connection} />
        <Form method="post">
          <s-button type="submit" variant="primary">
            Έλεγχος σύνδεσης
          </s-button>
        </Form>
        <s-paragraph>
          Μην εγκαταστήσετε την εφαρμογή στο live κατάστημα
          nth02c-ir.myshopify.com χωρίς έγκριση του εμπόρου. Oxygen μόνο στο
          https://sandbox-api.oxygen.gr/v1, σε development store.
        </s-paragraph>
        <s-paragraph>
          {inventoryWritesEnabled
            ? "Απόθεμα: οι ενημερώσεις γράφονται στη μία αποθήκη OXYGEN_DEFAULT_WAREHOUSE_ID."
            : "Απόθεμα: ανενεργό. Το OXYGEN_DEFAULT_WAREHOUSE_ID είναι κενό, οπότε το inventory_levels/update δεν γράφει ποσότητα. Πελάτες, προϊόντα και παραγγελίες συγχρονίζονται."}
        </s-paragraph>
      </s-section>

      <s-section heading="Τελευταίος συγχρονισμός">
        {!syncLogReady ? (
          <s-paragraph>
            Η βάση δεν είναι έτοιμη. Τρέξτε{" "}
            <s-text type="strong">npx prisma migrate deploy</s-text>. Μέχρι τότε
            δεν υπάρχει καταγραφή συγχρονισμού.
          </s-paragraph>
        ) : lastSync ? (
          <s-paragraph>
            {lastSync.createdAt} — {lastSync.topic} — {lastSync.status}
            {lastSync.shopifyId ? ` — Shopify ${lastSync.shopifyId}` : ""}
            {lastSync.message ? `. ${lastSync.message}` : ""}
          </s-paragraph>
        ) : (
          <s-paragraph>
            Δεν υπάρχει ακόμη καταγραφή συγχρονισμού. Οι webhooks γράφουν εδώ
            αφού παραδοθούν με έγκυρο HMAC.
          </s-paragraph>
        )}
      </s-section>

      <s-section heading="Webhooks">
        <s-unordered-list>
          {webhooks.map((hook) => (
            <s-list-item key={hook.topic}>
              <s-text type="strong">{hook.topic}</s-text> → {hook.uri}.{" "}
              {hook.summary}
            </s-list-item>
          ))}
        </s-unordered-list>
        <s-paragraph>
          Το HMAC ελέγχεται από authenticate.webhook με το SHOPIFY_API_SECRET.
          Το ίδιο X-Shopify-Webhook-Id δεν ξανατρέχει sync αν έχει ήδη κατάσταση
          stub, synced ή skipped.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Φάσεις">
        <s-unordered-list>
          <s-list-item>Επαφές και προϊόντα</s-list-item>
          <s-list-item>Απόθεμα (location ↔ warehouse)</s-list-item>
          <s-list-item>Παραγγελίες → τιμολόγια στο Oxygen</s-list-item>
          <s-list-item>Live κατάστημα μόνο με έγκριση</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

function ConnectionDetails({
  connection,
}: {
  connection: ConnectionCheck;
}) {
  if (connection.status === "unconfigured") {
    return (
      <s-paragraph>
        Δεν έχει οριστεί OXYGEN_API_KEY. Δεν έγινε κλήση στο Oxygen. Base URL:{" "}
        {connection.baseUrl}
      </s-paragraph>
    );
  }

  if (connection.status === "error") {
    return (
      <s-paragraph>
        Αποτυχία σύνδεσης
        {connection.baseUrl ? ` (${connection.baseUrl})` : ""}:{" "}
        {connection.message}
      </s-paragraph>
    );
  }

  return (
    <s-paragraph>
      Sandbox OK — {connection.title ?? "Oxygen"} {connection.version ?? ""} (
      {connection.environment ?? "unknown"}) στο {connection.baseUrl}.
      {connection.productionWarning
        ? " Η απάντηση λέει environment=production. Μην συνεχίσετε σε live δεδομένα."
        : ""}
    </s-paragraph>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
