import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PREMIUM_APP_URL, getPremiumAppUrl, verifyPremiumAccess } from "./premiumAccess";

type MockStripe = Parameters<typeof verifyPremiumAccess>[0]["stripe"];

function checkoutStripe(session: Record<string, unknown>): MockStripe {
  return {
    checkout: {
      sessions: {
        retrieve: async () => session,
      },
    },
    subscriptions: {
      search: async () => ({ data: [] }),
    },
  } as MockStripe;
}

function subscriptionStripe(data: Array<Record<string, unknown>>): MockStripe {
  return {
    checkout: {
      sessions: {
        retrieve: async () => {
          throw new Error("checkout session lookup should not run");
        },
      },
    },
    subscriptions: {
      search: async () => ({ data }),
    },
  } as MockStripe;
}

async function withConfiguredPremiumUrl(run: () => Promise<void>) {
  const previous = process.env.PREMIUM_APP_URL;
  process.env.PREMIUM_APP_URL = "https://premium.example.com/learning";

  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.PREMIUM_APP_URL;
    else process.env.PREMIUM_APP_URL = previous;
  }
}

test("premium access defaults to the linked learning app", () => {
  const previous = process.env.PREMIUM_APP_URL;
  delete process.env.PREMIUM_APP_URL;

  try {
    assert.equal(getPremiumAppUrl(), DEFAULT_PREMIUM_APP_URL);
  } finally {
    if (previous === undefined) delete process.env.PREMIUM_APP_URL;
    else process.env.PREMIUM_APP_URL = previous;
  }
});

test("premium access accepts a configured HTTPS app URL", () => {
  const previous = process.env.PREMIUM_APP_URL;
  process.env.PREMIUM_APP_URL = "https://premium.example.com/learning";

  try {
    assert.equal(getPremiumAppUrl(), "https://premium.example.com/learning");
  } finally {
    if (previous === undefined) delete process.env.PREMIUM_APP_URL;
    else process.env.PREMIUM_APP_URL = previous;
  }
});

test("premium access rejects HTTP URLs in production", () => {
  const previousUrl = process.env.PREMIUM_APP_URL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.PREMIUM_APP_URL = "http://premium.example.com/learning";
  process.env.NODE_ENV = "production";

  try {
    assert.throws(() => getPremiumAppUrl(), /must use HTTPS/);
  } finally {
    if (previousUrl === undefined) delete process.env.PREMIUM_APP_URL;
    else process.env.PREMIUM_APP_URL = previousUrl;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("checkout access denies an inactive subscription", async () => {
  const result = await verifyPremiumAccess({
    stripe: checkoutStripe({
      client_reference_id: "user-123",
      payment_status: "paid",
      metadata: { frenchamiUserId: "user-123", frenchamiPlanId: "basic" },
      subscription: { status: "incomplete" },
    }),
    userId: "user-123",
    sessionId: "cs_inactive",
  });

  assert.deepEqual(result, { active: false, planId: null, premiumUrl: null });
});

test("checkout access denies an unpaid session", async () => {
  const result = await verifyPremiumAccess({
    stripe: checkoutStripe({
      client_reference_id: "user-123",
      payment_status: "unpaid",
      metadata: { frenchamiUserId: "user-123", frenchamiPlanId: "basic" },
      subscription: { status: "active" },
    }),
    userId: "user-123",
    sessionId: "cs_unpaid",
  });

  assert.deepEqual(result, { active: false, planId: null, premiumUrl: null });
});

test("checkout access denies a cancelled subscription", async () => {
  const result = await verifyPremiumAccess({
    stripe: checkoutStripe({
      client_reference_id: "user-123",
      payment_status: "paid",
      metadata: { frenchamiUserId: "user-123", frenchamiPlanId: "basic" },
      subscription: { status: "canceled" },
    }),
    userId: "user-123",
    sessionId: "cs_cancelled",
  });

  assert.deepEqual(result, { active: false, planId: null, premiumUrl: null });
});

test("checkout access denies a session belonging to another user", async () => {
  const result = await verifyPremiumAccess({
    stripe: checkoutStripe({
      client_reference_id: "another-user",
      payment_status: "paid",
      metadata: { frenchamiUserId: "user-123", frenchamiPlanId: "basic" },
      subscription: { status: "active" },
    }),
    userId: "user-123",
    sessionId: "cs_mismatched",
  });

  assert.deepEqual(result, { active: false, planId: null, premiumUrl: null });
});

test("checkout access returns the configured premium URL for an active subscription", async () => {
  await withConfiguredPremiumUrl(async () => {
    const result = await verifyPremiumAccess({
      stripe: checkoutStripe({
        client_reference_id: "user-123",
        payment_status: "paid",
        metadata: { frenchamiUserId: "user-123", frenchamiPlanId: "platinum" },
        subscription: { status: "active" },
      }),
      userId: "user-123",
      sessionId: "cs_active",
    });

    assert.deepEqual(result, {
      active: true,
      planId: "platinum",
      premiumUrl: "https://premium.example.com/learning",
    });
  });
});

test("checkout access uses matching Frenchami metadata when the client reference is absent", async () => {
  await withConfiguredPremiumUrl(async () => {
    const result = await verifyPremiumAccess({
      stripe: checkoutStripe({
        client_reference_id: null,
        payment_status: "paid",
        metadata: { frenchamiUserId: "user-123", frenchamiPlanId: "premium" },
        subscription: { status: "active" },
      }),
      userId: "user-123",
      sessionId: "cs_metadata_user",
    });

    assert.deepEqual(result, {
      active: true,
      planId: "premium",
      premiumUrl: "https://premium.example.com/learning",
    });
  });
});

test("checkout access denies a session with mismatched Frenchami metadata when the client reference is absent", async () => {
  const result = await verifyPremiumAccess({
    stripe: checkoutStripe({
      client_reference_id: null,
      payment_status: "paid",
      metadata: { frenchamiUserId: "another-user", frenchamiPlanId: "premium" },
      subscription: { status: "active" },
    }),
    userId: "user-123",
    sessionId: "cs_metadata_mismatched",
  });

  assert.deepEqual(result, { active: false, planId: null, premiumUrl: null });
});

test("ongoing subscription lookup denies users without an active subscription", async () => {
  const result = await verifyPremiumAccess({
    stripe: subscriptionStripe([
      { status: "canceled", metadata: { frenchamiPlanId: "basic" } },
      { status: "past_due", metadata: { frenchamiPlanId: "platinum" } },
    ]),
    userId: "user-123",
  });

  assert.deepEqual(result, { active: false, planId: null, premiumUrl: null });
});

test("ongoing subscription lookup returns the configured premium URL for an active subscription", async () => {
  await withConfiguredPremiumUrl(async () => {
    const result = await verifyPremiumAccess({
      stripe: subscriptionStripe([
        { status: "canceled", metadata: { frenchamiPlanId: "basic" } },
        { status: "active", metadata: { frenchamiPlanId: "platinum" } },
      ]),
      userId: "user-123",
    });

    assert.deepEqual(result, {
      active: true,
      planId: "platinum",
      premiumUrl: "https://premium.example.com/learning",
    });
  });
});