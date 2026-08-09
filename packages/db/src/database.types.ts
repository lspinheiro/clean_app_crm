export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          company_id: string;
          contact_name: string | null;
          created_at: string;
          id: string;
          name: string;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          contact_name?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      companies: {
        Row: {
          abn: string;
          created_at: string;
          id: string;
          logo_path: string | null;
          name: string;
          status: Database["public"]["Enums"]["company_status"];
          timezone: string;
          updated_at: string;
        };
        Insert: {
          abn: string;
          created_at?: string;
          id?: string;
          logo_path?: string | null;
          name: string;
          status?: Database["public"]["Enums"]["company_status"];
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          abn?: string;
          created_at?: string;
          id?: string;
          logo_path?: string | null;
          name?: string;
          status?: Database["public"]["Enums"]["company_status"];
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      company_logo_upload_reservations: {
        Row: {
          company_id: string;
          created_at: string;
          object_name: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          object_name: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          object_name?: string;
        };
        Relationships: [];
      };
      company_invites: {
        Row: {
          code: string;
          company_id: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          revoked_at: string | null;
        };
        Insert: {
          code: string;
          company_id: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          revoked_at?: string | null;
        };
        Update: {
          code?: string;
          company_id?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      company_members: {
        Row: {
          company_id: string;
          id: string;
          joined_at: string;
          profile_id: string;
          status: Database["public"]["Enums"]["member_status"];
        };
        Insert: {
          company_id: string;
          id?: string;
          joined_at?: string;
          profile_id: string;
          status?: Database["public"]["Enums"]["member_status"];
        };
        Update: {
          company_id?: string;
          id?: string;
          joined_at?: string;
          profile_id?: string;
          status?: Database["public"]["Enums"]["member_status"];
        };
        Relationships: [];
      };
      job_assignments: {
        Row: {
          assigned_at: string;
          assignment_end: string;
          assignment_start: string;
          cleaner_id: string;
          id: string;
          job_id: string;
          slot_number: number;
          unassigned_at: string | null;
        };
        Insert: {
          assigned_at?: string;
          assignment_end: string;
          assignment_start: string;
          cleaner_id: string;
          id?: string;
          job_id: string;
          slot_number: number;
          unassigned_at?: string | null;
        };
        Update: {
          assigned_at?: string;
          assignment_end?: string;
          assignment_start?: string;
          cleaner_id?: string;
          id?: string;
          job_id?: string;
          slot_number?: number;
          unassigned_at?: string | null;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          cleaner_pay_cents: number;
          client_charge_cents: number | null;
          created_at: string;
          crew_size: number;
          duration_minutes: number;
          id: string;
          scheduled_end: string;
          scheduled_start: string;
          service_id: string;
          site_id: string;
          status: Database["public"]["Enums"]["job_status"];
          updated_at: string;
        };
        Insert: {
          cleaner_pay_cents: number;
          client_charge_cents?: number | null;
          created_at?: string;
          crew_size: number;
          duration_minutes: number;
          id?: string;
          scheduled_end: string;
          scheduled_start: string;
          service_id: string;
          site_id: string;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
        };
        Update: {
          cleaner_pay_cents?: number;
          client_charge_cents?: number | null;
          created_at?: string;
          crew_size?: number;
          duration_minutes?: number;
          id?: string;
          scheduled_end?: string;
          scheduled_start?: string;
          service_id?: string;
          site_id?: string;
          status?: Database["public"]["Enums"]["job_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          phone: string | null;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      recurring_assignment_cleaners: {
        Row: {
          cleaner_id: string;
          created_at: string;
          recurring_assignment_id: string;
          slot_number: number;
        };
        Insert: {
          cleaner_id: string;
          created_at?: string;
          recurring_assignment_id: string;
          slot_number: number;
        };
        Update: {
          cleaner_id?: string;
          created_at?: string;
          recurring_assignment_id?: string;
          slot_number?: number;
        };
        Relationships: [];
      };
      recurring_assignments: {
        Row: {
          active: boolean;
          anchor_date: string;
          cleaner_pay_cents: number;
          created_at: string;
          crew_size: number;
          duration_minutes: number;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id: string;
          local_start_time: string;
          service_id: string;
          site_id: string;
          updated_at: string;
          weekday: number;
        };
        Insert: {
          active?: boolean;
          anchor_date: string;
          cleaner_pay_cents: number;
          created_at?: string;
          crew_size: number;
          duration_minutes: number;
          frequency: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          local_start_time: string;
          service_id: string;
          site_id: string;
          updated_at?: string;
          weekday: number;
        };
        Update: {
          active?: boolean;
          anchor_date?: string;
          cleaner_pay_cents?: number;
          created_at?: string;
          crew_size?: number;
          duration_minutes?: number;
          frequency?: Database["public"]["Enums"]["recurrence_frequency"];
          id?: string;
          local_start_time?: string;
          service_id?: string;
          site_id?: string;
          updated_at?: string;
          weekday?: number;
        };
        Relationships: [];
      };
      service_catalogue: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      site_preferred_cleaners: {
        Row: {
          cleaner_id: string;
          created_at: string;
          rank: number;
          site_id: string;
        };
        Insert: {
          cleaner_id: string;
          created_at?: string;
          rank: number;
          site_id: string;
        };
        Update: {
          cleaner_id?: string;
          created_at?: string;
          rank?: number;
          site_id?: string;
        };
        Relationships: [];
      };
      sites: {
        Row: {
          access_notes: string | null;
          address: string;
          client_id: string;
          created_at: string;
          default_duration_minutes: number | null;
          default_rate_cents: number | null;
          default_service_id: string | null;
          id: string;
          name: string;
          suburb: string;
          updated_at: string;
        };
        Insert: {
          access_notes?: string | null;
          address: string;
          client_id: string;
          created_at?: string;
          default_duration_minutes?: number | null;
          default_rate_cents?: number | null;
          default_service_id?: string | null;
          id?: string;
          name: string;
          suburb: string;
          updated_at?: string;
        };
        Update: {
          access_notes?: string | null;
          address?: string;
          client_id?: string;
          created_at?: string;
          default_duration_minutes?: number | null;
          default_rate_cents?: number | null;
          default_service_id?: string | null;
          id?: string;
          name?: string;
          suburb?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      vacancies: {
        Row: {
          cleaner_pay_cents: number | null;
          client_id: string | null;
          client_name: string | null;
          company_id: string | null;
          crew_size: number | null;
          crew_slot: number | null;
          duration_minutes: number | null;
          job_id: string | null;
          preferred_cleaner_ids: string[] | null;
          scheduled_start: string | null;
          service_id: string | null;
          service_name: string | null;
          site_id: string | null;
          site_name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      can_delete_unreferenced_company_logo: {
        Args: { object_name: string };
        Returns: boolean;
      };
      can_manage_company_logo: {
        Args: { object_name: string };
        Returns: boolean;
      };
      can_upload_reserved_company_logo: {
        Args: { requested_object_name: string };
        Returns: boolean;
      };
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      create_recurring_assignment: {
        Args: {
          named_cleaner_ids: string[];
          target_anchor_date: string;
          target_cleaner_pay_cents: number;
          target_crew_size: number;
          target_duration_minutes: number;
          target_frequency: Database["public"]["Enums"]["recurrence_frequency"];
          target_local_start_time: string;
          target_service_id: string;
          target_site_id: string;
          target_weekday: number;
        };
        Returns: string;
      };
      create_client: {
        Args: {
          client_contact_name?: string | null;
          client_name: string;
          client_notes?: string | null;
          client_phone?: string | null;
          target_company_id: string;
        };
        Returns: Database["public"]["Tables"]["clients"]["Row"];
      };
      create_site: {
        Args: {
          site_access_notes?: string | null;
          site_address: string;
          site_name: string;
          site_suburb: string;
          target_client_id: string;
        };
        Returns: Database["public"]["Tables"]["sites"]["Row"];
      };
      is_company_admin: {
        Args: { target_company_id: string };
        Returns: boolean;
      };
      rotate_company_invite: {
        Args: { target_company_id: string };
        Returns: Database["public"]["Tables"]["company_invites"]["Row"];
      };
      reserve_company_logo_upload: {
        Args: {
          requested_object_name: string;
          target_company_id: string;
        };
        Returns: string;
      };
      set_recurring_assignment_active: {
        Args: {
          target_active: boolean;
          target_recurring_assignment_id: string;
        };
        Returns: undefined;
      };
      set_site_preferred_cleaners: {
        Args: {
          cleaner_ids: string[];
          target_site_id: string;
        };
        Returns: undefined;
      };
      update_company_identity: {
        Args: {
          company_abn: string;
          company_logo_path?: string | null;
          company_name: string;
          target_company_id: string;
        };
        Returns: Database["public"]["Tables"]["companies"]["Row"];
      };
      update_client: {
        Args: {
          client_contact_name?: string | null;
          client_name: string;
          client_notes?: string | null;
          client_phone?: string | null;
          target_client_id: string;
        };
        Returns: Database["public"]["Tables"]["clients"]["Row"];
      };
      update_recurring_assignment: {
        Args: {
          named_cleaner_ids: string[];
          target_anchor_date: string;
          target_cleaner_pay_cents: number;
          target_crew_size: number;
          target_duration_minutes: number;
          target_frequency: Database["public"]["Enums"]["recurrence_frequency"];
          target_local_start_time: string;
          target_recurring_assignment_id: string;
          target_service_id: string;
          target_weekday: number;
        };
        Returns: undefined;
      };
      update_site: {
        Args: {
          site_access_notes: string | null;
          site_address: string;
          site_default_duration_minutes: number;
          site_default_rate_cents: number;
          site_default_service_id: string;
          site_name: string;
          site_suburb: string;
          target_site_id: string;
        };
        Returns: Database["public"]["Tables"]["sites"]["Row"];
      };
    };
    Enums: {
      app_role: "company_admin" | "cleaner" | "admin";
      company_status: "pending" | "approved" | "suspended";
      job_status:
        | "draft"
        | "posted"
        | "assigned"
        | "on_the_way"
        | "in_progress"
        | "completed"
        | "cancelled";
      member_status: "active" | "removed";
      recurrence_frequency: "weekly" | "fortnightly";
    };
    CompositeTypes: Record<string, never>;
  };
};
