export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          company_id: string
          contact_name: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_name?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_name?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          abn: string
          created_at: string
          id: string
          logo_path: string | null
          name: string
          status: Database["public"]["Enums"]["company_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          abn: string
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          abn?: string
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          status?: Database["public"]["Enums"]["company_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_invites: {
        Row: {
          code: string
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          revoked_at: string | null
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_logo_upload_reservations: {
        Row: {
          company_id: string
          created_at: string
          object_name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          object_name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          object_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_logo_upload_reservations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          id: string
          joined_at: string
          profile_id: string
          status: Database["public"]["Enums"]["member_status"]
        }
        Insert: {
          company_id: string
          id?: string
          joined_at?: string
          profile_id: string
          status?: Database["public"]["Enums"]["member_status"]
        }
        Update: {
          company_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["member_status"]
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_applications: {
        Row: {
          applied_at: string
          cleaner_id: string
          id: string
          job_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["application_status"]
          withdrawn_at: string | null
        }
        Insert: {
          applied_at?: string
          cleaner_id: string
          id?: string
          job_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          withdrawn_at?: string | null
        }
        Update: {
          applied_at?: string
          cleaner_id?: string
          id?: string
          job_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_applications_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaner_job_board"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["job_id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          assigned_at: string
          assignment_end: string
          assignment_start: string
          cleaner_id: string
          id: string
          job_id: string
          slot_number: number
          source: Database["public"]["Enums"]["assignment_source"]
          unassigned_at: string | null
        }
        Insert: {
          assigned_at?: string
          assignment_end: string
          assignment_start: string
          cleaner_id: string
          id?: string
          job_id: string
          slot_number: number
          source?: Database["public"]["Enums"]["assignment_source"]
          unassigned_at?: string | null
        }
        Update: {
          assigned_at?: string
          assignment_end?: string
          assignment_start?: string
          cleaner_id?: string
          id?: string
          job_id?: string
          slot_number?: number
          source?: Database["public"]["Enums"]["assignment_source"]
          unassigned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaner_job_board"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["job_id"]
          },
        ]
      }
      jobs: {
        Row: {
          cancelled_by_rule_deactivation_at: string | null
          cleaner_pay_cents: number
          client_charge_cents: number | null
          created_at: string
          crew_size: number
          duration_minutes: number
          generated_at: string | null
          generated_rule_version: number | null
          id: string
          manually_edited_at: string | null
          notes: string | null
          recurring_assignment_id: string | null
          scheduled_end: string
          scheduled_start: string
          service_date: string | null
          service_id: string
          site_id: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          cancelled_by_rule_deactivation_at?: string | null
          cleaner_pay_cents: number
          client_charge_cents?: number | null
          created_at?: string
          crew_size: number
          duration_minutes: number
          generated_at?: string | null
          generated_rule_version?: number | null
          id?: string
          manually_edited_at?: string | null
          notes?: string | null
          recurring_assignment_id?: string | null
          scheduled_end: string
          scheduled_start: string
          service_date?: string | null
          service_id: string
          site_id: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          cancelled_by_rule_deactivation_at?: string | null
          cleaner_pay_cents?: number
          client_charge_cents?: number | null
          created_at?: string
          crew_size?: number
          duration_minutes?: number
          generated_at?: string | null
          generated_rule_version?: number | null
          id?: string
          manually_edited_at?: string | null
          notes?: string | null
          recurring_assignment_id?: string | null
          scheduled_end?: string
          scheduled_start?: string
          service_date?: string | null
          service_id?: string
          site_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_recurring_assignment_id_fkey"
            columns: ["recurring_assignment_id"]
            isOneToOne: false
            referencedRelation: "recurring_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          job_id: string
          read_at: string | null
          recipient_id: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          read_at?: string | null
          recipient_id: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          read_at?: string | null
          recipient_id?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaner_job_board"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      recurring_assignment_cleaners: {
        Row: {
          cleaner_id: string
          created_at: string
          recurring_assignment_id: string
          slot_number: number
        }
        Insert: {
          cleaner_id: string
          created_at?: string
          recurring_assignment_id: string
          slot_number: number
        }
        Update: {
          cleaner_id?: string
          created_at?: string
          recurring_assignment_id?: string
          slot_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_assignment_cleaners_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_assignment_cleaners_recurring_assignment_id_fkey"
            columns: ["recurring_assignment_id"]
            isOneToOne: false
            referencedRelation: "recurring_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_assignments: {
        Row: {
          active: boolean
          anchor_date: string
          cleaner_pay_cents: number
          created_at: string
          crew_size: number
          duration_minutes: number
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          generation_version: number
          id: string
          local_start_time: string
          service_id: string
          site_id: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          anchor_date: string
          cleaner_pay_cents: number
          created_at?: string
          crew_size: number
          duration_minutes: number
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          generation_version?: number
          id?: string
          local_start_time: string
          service_id: string
          site_id: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          anchor_date?: string
          cleaner_pay_cents?: number
          created_at?: string
          crew_size?: number
          duration_minutes?: number
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          generation_version?: number
          id?: string
          local_start_time?: string
          service_id?: string
          site_id?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_assignments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_assignments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_generation_failures: {
        Row: {
          error_code: string
          error_message: string
          failed_at: string
          recurring_assignment_id: string
        }
        Insert: {
          error_code: string
          error_message: string
          failed_at?: string
          recurring_assignment_id: string
        }
        Update: {
          error_code?: string
          error_message?: string
          failed_at?: string
          recurring_assignment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_generation_failures_recurring_assignment_id_fkey"
            columns: ["recurring_assignment_id"]
            isOneToOne: true
            referencedRelation: "recurring_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalogue: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      site_access_log: {
        Row: {
          accessed_at: string
          assignment_id: string
          cleaner_id: string
          id: string
          job_id: string
          site_id: string
        }
        Insert: {
          accessed_at?: string
          assignment_id: string
          cleaner_id: string
          id?: string
          job_id: string
          site_id: string
        }
        Update: {
          accessed_at?: string
          assignment_id?: string
          cleaner_id?: string
          id?: string
          job_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_access_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "cleaner_my_jobs"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "site_access_log_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "job_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_access_log_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_access_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaner_job_board"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "site_access_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_access_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "site_access_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_preferred_cleaners: {
        Row: {
          cleaner_id: string
          created_at: string
          rank: number
          site_id: string
        }
        Insert: {
          cleaner_id: string
          created_at?: string
          rank: number
          site_id: string
        }
        Update: {
          cleaner_id?: string
          created_at?: string
          rank?: number
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_preferred_cleaners_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_preferred_cleaners_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          access_notes: string | null
          address: string
          client_id: string
          created_at: string
          default_duration_minutes: number | null
          default_rate_cents: number | null
          default_service_id: string | null
          id: string
          name: string
          suburb: string
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          address: string
          client_id: string
          created_at?: string
          default_duration_minutes?: number | null
          default_rate_cents?: number | null
          default_service_id?: string | null
          id?: string
          name: string
          suburb: string
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          address?: string
          client_id?: string
          created_at?: string
          default_duration_minutes?: number | null
          default_rate_cents?: number | null
          default_service_id?: string | null
          id?: string
          name?: string
          suburb?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_default_service_id_fkey"
            columns: ["default_service_id"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cleaner_job_board: {
        Row: {
          cleaner_pay_cents: number | null
          company_id: string | null
          company_logo_path: string | null
          company_name: string | null
          crew_size: number | null
          crew_slot: number | null
          duration_minutes: number | null
          job_id: string | null
          my_application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          scheduled_start: string | null
          service_id: string | null
          service_name: string | null
          site_name: string | null
          suburb: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaner_my_jobs: {
        Row: {
          assigned_at: string | null
          assignment_id: string | null
          cleaner_pay_cents: number | null
          company_id: string | null
          company_logo_path: string | null
          company_name: string | null
          duration_minutes: number | null
          job_id: string | null
          scheduled_start: string | null
          service_id: string | null
          service_name: string | null
          site_name: string | null
          slot_number: number | null
          status: Database["public"]["Enums"]["job_status"] | null
          suburb: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaner_job_board"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["id"]
          },
        ]
      }
      vacancies: {
        Row: {
          cleaner_pay_cents: number | null
          client_id: string | null
          client_name: string | null
          company_id: string | null
          crew_size: number | null
          crew_slot: number | null
          duration_minutes: number | null
          job_id: string | null
          preferred_cleaner_ids: string[] | null
          scheduled_start: string | null
          service_id: string | null
          service_name: string | null
          site_id: string | null
          site_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_to_job: { Args: { target_job_id: string }; Returns: string }
      assign_job_slot: {
        Args: {
          target_cleaner_id: string
          target_job_id: string
          target_slot_number: number
        }
        Returns: string
      }
      can_delete_unreferenced_company_logo: {
        Args: { object_name: string }
        Returns: boolean
      }
      can_manage_company_logo: {
        Args: { object_name: string }
        Returns: boolean
      }
      can_upload_reserved_company_logo: {
        Args: { requested_object_name: string }
        Returns: boolean
      }
      cancel_job: { Args: { target_job_id: string }; Returns: undefined }
      compact_recurring_assignment_cleaners: {
        Args: { target_recurring_assignment_id: string }
        Returns: undefined
      }
      create_client: {
        Args: {
          client_contact_name?: string
          client_name: string
          client_notes?: string
          client_phone?: string
          target_company_id: string
        }
        Returns: {
          company_id: string
          contact_name: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_one_off_job: {
        Args: {
          target_cleaner_pay_cents: number
          target_client_charge_cents?: number
          target_crew_size: number
          target_duration_minutes: number
          target_local_date: string
          target_local_start_time: string
          target_notes?: string
          target_post_now: boolean
          target_service_id: string
          target_site_id: string
        }
        Returns: string
      }
      create_recurring_assignment: {
        Args: {
          named_cleaner_ids: string[]
          target_anchor_date: string
          target_cleaner_pay_cents: number
          target_crew_size: number
          target_duration_minutes: number
          target_frequency: Database["public"]["Enums"]["recurrence_frequency"]
          target_local_start_time: string
          target_service_id: string
          target_site_id: string
          target_weekday: number
        }
        Returns: string
      }
      create_site: {
        Args: {
          site_access_notes?: string
          site_address: string
          site_name: string
          site_suburb: string
          target_client_id: string
        }
        Returns: {
          access_notes: string | null
          address: string
          client_id: string
          created_at: string
          default_duration_minutes: number | null
          default_rate_cents: number | null
          default_service_id: string | null
          id: string
          name: string
          suburb: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      generate_recurring_jobs: { Args: never; Returns: number }
      generate_recurring_jobs_at: {
        Args: { as_of: string; target_recurring_assignment_id?: string }
        Returns: number
      }
      get_cleaner_job_access: {
        Args: { target_job_id: string }
        Returns: {
          access_notes: string
          address: string
        }[]
      }
      is_company_admin: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      post_job: { Args: { target_job_id: string }; Returns: undefined }
      reconcile_recurring_assignment_jobs: {
        Args: { as_of: string; target_recurring_assignment_id: string }
        Returns: number
      }
      release_cleaner_loop_state: {
        Args: { target_cleaner_id: string; target_company_id: string }
        Returns: undefined
      }
      reserve_company_logo_upload: {
        Args: { requested_object_name: string; target_company_id: string }
        Returns: string
      }
      rotate_company_invite: {
        Args: { target_company_id: string }
        Returns: {
          code: string
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          revoked_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "company_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_recurring_assignment_active: {
        Args: { target_active: boolean; target_recurring_assignment_id: string }
        Returns: undefined
      }
      set_site_preferred_cleaners: {
        Args: { cleaner_ids: string[]; target_site_id: string }
        Returns: undefined
      }
      update_client: {
        Args: {
          client_contact_name?: string
          client_name: string
          client_notes?: string
          client_phone?: string
          target_client_id: string
        }
        Returns: {
          company_id: string
          contact_name: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_company_identity: {
        Args: {
          company_abn: string
          company_logo_path?: string
          company_name: string
          target_company_id: string
        }
        Returns: {
          abn: string
          created_at: string
          id: string
          logo_path: string | null
          name: string
          status: Database["public"]["Enums"]["company_status"]
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "companies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_job_status: {
        Args: {
          target_job_id: string
          target_new_status: Database["public"]["Enums"]["job_status"]
        }
        Returns: undefined
      }
      update_recurring_assignment: {
        Args: {
          named_cleaner_ids: string[]
          target_anchor_date: string
          target_cleaner_pay_cents: number
          target_crew_size: number
          target_duration_minutes: number
          target_frequency: Database["public"]["Enums"]["recurrence_frequency"]
          target_local_start_time: string
          target_recurring_assignment_id: string
          target_service_id: string
          target_weekday: number
        }
        Returns: undefined
      }
      update_site: {
        Args: {
          site_access_notes: string
          site_address: string
          site_default_duration_minutes: number
          site_default_rate_cents: number
          site_default_service_id: string
          site_name: string
          site_suburb: string
          target_site_id: string
        }
        Returns: {
          access_notes: string | null
          address: string
          client_id: string
          created_at: string
          default_duration_minutes: number | null
          default_rate_cents: number | null
          default_service_id: string | null
          id: string
          name: string
          suburb: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      withdraw_application: {
        Args: { target_job_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "company_admin" | "cleaner" | "admin"
      application_status: "applied" | "assigned" | "not_selected" | "withdrawn"
      assignment_source: "manual" | "recurring"
      company_status: "pending" | "approved" | "suspended"
      job_status:
        | "draft"
        | "posted"
        | "assigned"
        | "on_the_way"
        | "in_progress"
        | "completed"
        | "cancelled"
      member_status: "active" | "removed"
      notification_type: "job_assigned" | "job_posted" | "job_cancelled"
      recurrence_frequency: "weekly" | "fortnightly"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["company_admin", "cleaner", "admin"],
      application_status: ["applied", "assigned", "not_selected", "withdrawn"],
      assignment_source: ["manual", "recurring"],
      company_status: ["pending", "approved", "suspended"],
      job_status: [
        "draft",
        "posted",
        "assigned",
        "on_the_way",
        "in_progress",
        "completed",
        "cancelled",
      ],
      member_status: ["active", "removed"],
      notification_type: ["job_assigned", "job_posted", "job_cancelled"],
      recurrence_frequency: ["weekly", "fortnightly"],
    },
  },
} as const
