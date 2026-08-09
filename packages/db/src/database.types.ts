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
    };
    Views: Record<string, never>;
    Functions: {
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      is_company_admin: {
        Args: { target_company_id: string };
        Returns: boolean;
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
