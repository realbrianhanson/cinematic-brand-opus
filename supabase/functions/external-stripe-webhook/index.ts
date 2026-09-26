import Stripe from "npm:stripe@22.6.0";
import {
  offerAdminClient,
  requireOfferAdmin,
} from "../_shared/offersRuntime.ts";
import { createExternalPaymentHandler } from "../_shared/externalPaymentHandler.ts";
import {
  ExternalPaymentError,
  paymentObject,
} from "../_shared/externalPayments.ts";

Deno.serve(
  createExternalPaymentHandler({
    env: (name) => Deno.env.get(name),
    authorizeAdmin: (request) => requireOfferAdmin(request, offerAdminClient()),
    verify: async (body, signature, config) => {
      const stripe = new Stripe(config.secret, {
        httpClient: Stripe.createFetchHttpClient(),
        maxNetworkRetries: 0,
        timeout: 8000,
      });
      return stripe.webhooks.constructEventAsync(
        body,
        signature,
        config.webhookSecret,
        300,
        Stripe.createSubtleCryptoProvider(),
      );
    },
    store: () => {
      const admin = offerAdminClient();
      return {
        acquireRefresh: async (identity) => {
          const { data, error } = await admin.rpc(
            "external_payment_acquire_refresh",
            identity,
          );
          if (error)
            throw new ExternalPaymentError("payment_refresh_unavailable");
          return paymentObject(data);
        },
        releaseRefresh: async (identity) => {
          const { error } = await admin.rpc(
            "external_payment_release_refresh",
            identity,
          );
          if (error)
            throw new ExternalPaymentError(
              "payment_refresh_release_unavailable",
            );
        },
        status: async (identity) => {
          const { data, error } = await admin.rpc(
            "external_payment_event_status",
            identity,
          );
          if (error) throw new ExternalPaymentError("receipt_unavailable");
          return paymentObject(data);
        },
        apply: async (event, payments) => {
          const { data, error } = await admin.rpc(
            "external_payment_apply_event",
            { _event: event, _payments: payments },
          );
          if (error)
            throw new ExternalPaymentError("reconciliation_unavailable");
          return paymentObject(data);
        },
      };
    },
  }),
);
