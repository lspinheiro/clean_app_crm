import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.8";
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";

import {
  type BoardVisibleJob,
  createPushDispatchHandler,
  type DispatchStore,
  type PushMessage,
  type PushSender,
  type RecipientLocale,
  type StoredNotification,
  type StoredPushSubscription,
} from "./handler.ts";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function serviceRoleKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacyKey) return legacyKey;

  const keysJson = requiredEnvironment("SUPABASE_SECRET_KEYS");
  const parsed: unknown = JSON.parse(keysJson);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("SUPABASE_SECRET_KEYS must be a JSON object");
  }
  const defaultKey = Reflect.get(parsed, "default");
  if (typeof defaultKey !== "string" || defaultKey.trim() === "") {
    throw new Error("SUPABASE_SECRET_KEYS.default is required");
  }
  return defaultKey;
}

class SupabaseDispatchStore implements DispatchStore {
  constructor(private readonly client: SupabaseClient) {}

  async getNotification(
    notificationId: string,
  ): Promise<StoredNotification | null> {
    const { data, error } = await this.client
      .from("notifications")
      .select("recipient_id, job_id, recurring_assignment_id, type")
      .eq("id", notificationId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      recipientId: data.recipient_id,
      jobId: data.job_id,
      recurringAssignmentId: data.recurring_assignment_id,
      type: data.type,
    };
  }

  async listSubscriptions(
    profileId: string,
  ): Promise<StoredPushSubscription[]> {
    const { data, error } = await this.client
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("profile_id", profileId);
    if (error) throw error;
    return data ?? [];
  }

  async getRecipientLocale(profileId: string): Promise<RecipientLocale | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select("preferred_locale")
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data?.preferred_locale ?? null;
  }

  async getBoardVisibleJob(jobId: string): Promise<BoardVisibleJob | null> {
    const { data: job, error: jobError } = await this.client
      .from("jobs")
      .select("scheduled_start, site_id, service_id")
      .eq("id", jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return null;

    const [
      { data: site, error: siteError },
      { data: service, error: serviceError },
    ] = await Promise.all([
      this.client.from("sites").select("name, suburb").eq("id", job.site_id)
        .maybeSingle(),
      this.client
        .from("service_catalogue")
        .select("name, slug")
        .eq("id", job.service_id)
        .maybeSingle(),
    ]);
    if (siteError) throw siteError;
    if (serviceError) throw serviceError;
    if (!site || !service) return null;

    return {
      serviceName: service.name,
      serviceSlug: service.slug,
      siteName: site.name,
      suburb: site.suburb,
      scheduledStart: job.scheduled_start,
    };
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    const { error } = await this.client.from("push_subscriptions").delete().eq(
      "id",
      subscriptionId,
    );
    if (error) throw error;
  }
}

class VapidPushSender implements PushSender {
  send(
    subscription: StoredPushSubscription,
    message: PushMessage,
  ): Promise<{ statusCode: number }> {
    return webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(message),
    );
  }
}

const supabase = createClient(
  requiredEnvironment("SUPABASE_URL"),
  serviceRoleKey(),
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
webpush.setVapidDetails(
  requiredEnvironment("VAPID_SUBJECT"),
  requiredEnvironment("VAPID_PUBLIC_KEY"),
  requiredEnvironment("VAPID_PRIVATE_KEY"),
);

Deno.serve(
  createPushDispatchHandler({
    store: new SupabaseDispatchStore(supabase),
    sender: new VapidPushSender(),
    secret: requiredEnvironment("PUSH_DISPATCH_SECRET"),
    logger: console,
  }),
);
