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
    Views: Record<string, never>;
    Functions: {
      can_manage_company_logo: {
        Args: { object_name: string };
        Returns: boolean;
      };
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["app_role"];
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
          company_name: string;
          logo_uploaded?: boolean;
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
      member_status: "active" | "removed";
    };
    CompositeTypes: Record<string, never>;
  };
};
