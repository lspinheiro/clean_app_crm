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
      employee_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          account_existed_at_invitation: boolean
          company_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_profile_id: string
          last_link_sent_at: string | null
          locale: Database["public"]["Enums"]["app_locale"]
          revoked_at: string | null
          role: Database["public"]["Enums"]["employee_role"]
          superseded_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          account_existed_at_invitation: boolean
          company_id: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by_profile_id: string
          last_link_sent_at?: string | null
          locale: Database["public"]["Enums"]["app_locale"]
          revoked_at?: string | null
          role: Database["public"]["Enums"]["employee_role"]
          superseded_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          account_existed_at_invitation?: boolean
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_profile_id?: string
          last_link_sent_at?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["employee_role"]
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_memberships: {
        Row: {
          company_id: string
          id: string
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["employee_role"]
          status: Database["public"]["Enums"]["member_status"]
        }
        Insert: {
          company_id: string
          id?: string
          joined_at?: string
          profile_id: string
          role: Database["public"]["Enums"]["employee_role"]
          status?: Database["public"]["Enums"]["member_status"]
        }
        Update: {
          company_id?: string
          id?: string
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["employee_role"]
          status?: Database["public"]["Enums"]["member_status"]
        }
        Relationships: [
          {
            foreignKeyName: "employee_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      first_admin_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_profile_id: string | null
          company_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          locale: Database["public"]["Enums"]["app_locale"]
          revoked_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          locale: Database["public"]["Enums"]["app_locale"]
          revoked_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by_profile_id?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          locale?: Database["public"]["Enums"]["app_locale"]
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "first_admin_invitations_accepted_by_profile_id_fkey"
            columns: ["accepted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "first_admin_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      ledger_entries: {
        Row: {
          amount_cents: number
          cleaner_id: string
          company_id: string
          created_at: string
          id: string
          job_id: string
          paid_at: string | null
          payment_note: string | null
          status: Database["public"]["Enums"]["ledger_status"]
        }
        Insert: {
          amount_cents: number
          cleaner_id: string
          company_id: string
          created_at?: string
          id?: string
          job_id: string
          paid_at?: string | null
          payment_note?: string | null
          status?: Database["public"]["Enums"]["ledger_status"]
        }
        Update: {
          amount_cents?: number
          cleaner_id?: string
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string
          paid_at?: string | null
          payment_note?: string | null
          status?: Database["public"]["Enums"]["ledger_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaner_job_board"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "ledger_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["job_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          job_id: string
          ledger_entry_id: string | null
          read_at: string | null
          recipient_id: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          ledger_entry_id?: string | null
          read_at?: string | null
          recipient_id: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          ledger_entry_id?: string | null
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
            foreignKeyName: "notifications_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "cleaner_ledger_entries"
            referencedColumns: ["ledger_entry_id"]
          },
          {
            foreignKeyName: "notifications_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "company_ledger_entries"
            referencedColumns: ["ledger_entry_id"]
          },
          {
            foreignKeyName: "notifications_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
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
      pool_invite_email_batches: {
        Row: {
          authority_confirmed_at: string
          company_id: string
          confirmation_key: string
          created_at: string
          current_attempt: number
          id: string
          invite_id: string
          last_retry_key: string | null
          locale: Database["public"]["Enums"]["app_locale"]
          requested_by: string
        }
        Insert: {
          authority_confirmed_at: string
          company_id: string
          confirmation_key: string
          created_at?: string
          current_attempt?: number
          id?: string
          invite_id: string
          last_retry_key?: string | null
          locale: Database["public"]["Enums"]["app_locale"]
          requested_by: string
        }
        Update: {
          authority_confirmed_at?: string
          company_id?: string
          confirmation_key?: string
          created_at?: string
          current_attempt?: number
          id?: string
          invite_id?: string
          last_retry_key?: string | null
          locale?: Database["public"]["Enums"]["app_locale"]
          requested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_invite_email_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_invite_email_batches_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "company_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_invite_email_batches_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_invite_email_recipients: {
        Row: {
          attempt_number: number
          batch_id: string
          created_at: string
          email: string
          failure_reason: string | null
          id: string
          name: string | null
          provider_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_number?: number
          batch_id: string
          created_at?: string
          email: string
          failure_reason?: string | null
          id?: string
          name?: string | null
          provider_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          batch_id?: string
          created_at?: string
          email?: string
          failure_reason?: string | null
          id?: string
          name?: string | null
          provider_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_invite_email_recipients_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "pool_invite_email_batches"
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
          last_active_company: string | null
          phone: string | null
          preferred_locale: Database["public"]["Enums"]["app_locale"] | null
          suburb: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          last_active_company?: string | null
          phone?: string | null
          preferred_locale?: Database["public"]["Enums"]["app_locale"] | null
          suburb?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_active_company?: string | null
          phone?: string | null
          preferred_locale?: Database["public"]["Enums"]["app_locale"] | null
          suburb?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_active_company_fkey"
            columns: ["last_active_company"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          service_slug: string | null
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
      cleaner_ledger_entries: {
        Row: {
          amount_cents: number | null
          company_id: string | null
          company_logo_path: string | null
          company_name: string | null
          created_at: string | null
          ledger_entry_id: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["ledger_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          service_slug: string | null
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
      cleaner_pool_memberships: {
        Row: {
          company_id: string | null
          company_name: string | null
          profile_id: string | null
          status: Database["public"]["Enums"]["member_status"] | null
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
      company_ledger_entries: {
        Row: {
          amount_cents: number | null
          cleaner_id: string | null
          cleaner_name: string | null
          company_id: string | null
          created_at: string | null
          job_id: string | null
          ledger_entry_id: string | null
          paid_at: string | null
          payment_note: string | null
          scheduled_start: string | null
          site_id: string | null
          site_name: string | null
          status: Database["public"]["Enums"]["ledger_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_cleaner_id_fkey"
            columns: ["cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cleaner_job_board"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "ledger_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "vacancies"
            referencedColumns: ["job_id"]
          },
        ]
      }
      employee_invitation_states: {
        Row: {
          company_id: string | null
          created_at: string | null
          email: string | null
          id: string | null
          invitation_state: string | null
          role: Database["public"]["Enums"]["employee_role"] | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          invitation_state?: never
          role?: Database["public"]["Enums"]["employee_role"] | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          invitation_state?: never
          role?: Database["public"]["Enums"]["employee_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_membership_details: {
        Row: {
          company_id: string | null
          email: string | null
          full_name: string | null
          joined_at: string | null
          membership_id: string | null
          profile_id: string | null
          role: Database["public"]["Enums"]["employee_role"] | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      accept_employee_invitation: {
        Args: {
          full_name: string
          target_invitation_id: string
          target_locale: Database["public"]["Enums"]["app_locale"]
        }
        Returns: string
      }
      accept_first_admin_invitation: {
        Args: {
          company_abn: string
          company_name: string
          contact_phone: string
          full_name: string
          target_locale: Database["public"]["Enums"]["app_locale"]
        }
        Returns: string
      }
      apply_to_job: { Args: { target_job_id: string }; Returns: string }
      approve_job_application: {
        Args: {
          target_cleaner_id: string
          target_job_id: string
          target_slot_number: number
        }
        Returns: string
      }
      assign_job_slot: {
        Args: {
          target_cleaner_id: string
          target_job_id: string
          target_slot_number: number
        }
        Returns: string
      }
      backfill_completed_job_ledger_entries: {
        Args: { target_job_id: string }
        Returns: number
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
      change_employee_role: {
        Args: {
          target_company_id: string
          target_membership_id: string
          target_role: Database["public"]["Enums"]["employee_role"]
        }
        Returns: undefined
      }
      claim_employee_invitation_link: {
        Args: { target_invitation_id: string }
        Returns: {
          account_confirmed: boolean
          claimed: boolean
          invitee_email: string
          locale: Database["public"]["Enums"]["app_locale"]
        }[]
      }
      cleaner_invite_preview: {
        Args: { invite_code: string }
        Returns: {
          company_name: string
          pool_size: number
          state: string
        }[]
      }
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
      create_company: {
        Args: { company_abn: string; company_name: string }
        Returns: string
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
      delete_push_subscription: {
        Args: { target_endpoint: string }
        Returns: undefined
      }
      employee_invitation_preview: {
        Args: { target_invitation_id: string }
        Returns: {
          company_name: string
          invitee_hint: string
          role: Database["public"]["Enums"]["employee_role"]
          state: string
        }[]
      }
      first_admin_company_abn_available: {
        Args: { company_abn: string }
        Returns: boolean
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
      get_employee_invitation_context: {
        Args: { target_invitation_id: string }
        Returns: {
          account_existed_at_invitation: boolean
          company_name: string
          expires_at: string
          invitation_id: string
          invitation_status: string
          invitee_email: string
          locale: Database["public"]["Enums"]["app_locale"]
          profile_full_name: string
          profile_locale: Database["public"]["Enums"]["app_locale"] | null
          role: Database["public"]["Enums"]["employee_role"]
        }[]
      }
      get_first_admin_invitation_context: {
        Args: never
        Returns: {
          expires_at: string
          invitation_status: string
          invitee_email: string
          locale: Database["public"]["Enums"]["app_locale"]
        }[]
      }
      is_company_admin: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      is_company_employee: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      join_company_pool: {
        Args: {
          full_name: string
          invite_code: string
          phone: string
          suburb: string
        }
        Returns: {
          joined_company_id: string
          joined_company_name: string
        }[]
      }
      mark_job_application_not_selected: {
        Args: { target_cleaner_id: string; target_job_id: string }
        Returns: undefined
      }
      mark_ledger_paid: {
        Args: { target_ledger_entry_id: string; target_payment_note?: string }
        Returns: undefined
      }
      post_job: { Args: { target_job_id: string }; Returns: undefined }
      prepare_employee_invitation: {
        Args: {
          target_company_id: string
          target_email: string
          target_locale: Database["public"]["Enums"]["app_locale"]
          target_role: Database["public"]["Enums"]["employee_role"]
        }
        Returns: {
          account_existed: boolean
          auth_user_exists: boolean
          invitation_expires_at: string
          invitation_id: string
        }[]
      }
      prepare_first_admin_invitation: {
        Args: {
          expires_at: string
          invited_by: string
          target_email: string
          target_locale: Database["public"]["Enums"]["app_locale"]
        }
        Returns: {
          confirmed_auth_user: boolean
          created: boolean
          invitation_expires_at: string
          invitation_id: string
        }[]
      }
      prepare_pool_invite_email_batch: {
        Args: {
          authority_confirmed: boolean
          confirmation_key: string
          recipients: Json
          selected_invite_id: string
          selected_locale: Database["public"]["Enums"]["app_locale"]
          target_company_id: string
        }
        Returns: {
          attempt_number: number
          batch_id: string
          email: string
          failure_reason: string
          invite_code: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          provider_message_id: string
          recipient_id: string
          status: string
        }[]
      }
      prepare_pool_invite_email_retry: {
        Args: { retry_key: string; selected_batch_id: string }
        Returns: {
          attempt_number: number
          batch_id: string
          email: string
          failure_reason: string
          invite_code: string
          locale: Database["public"]["Enums"]["app_locale"]
          name: string
          provider_message_id: string
          recipient_id: string
          status: string
        }[]
      }
      reconcile_recurring_assignment_jobs: {
        Args: { as_of: string; target_recurring_assignment_id: string }
        Returns: number
      }
      record_pool_invite_email_results: {
        Args: {
          attempt_number: number
          provider_results: Json
          selected_batch_id: string
        }
        Returns: {
          email: string
          failure_reason: string
          name: string
          provider_message_id: string
          recipient_id: string
          status: string
        }[]
      }
      release_cleaner_loop_state: {
        Args: { target_cleaner_id: string; target_company_id: string }
        Returns: undefined
      }
      release_company_logo_upload: {
        Args: { target_company_id: string; target_object_name: string }
        Returns: boolean
      }
      release_employee_invitation_link_claim: {
        Args: { target_invitation_id: string }
        Returns: undefined
      }
      remove_employee: {
        Args: { target_company_id: string; target_membership_id: string }
        Returns: undefined
      }
      reserve_company_logo_upload: {
        Args: { requested_object_name: string; target_company_id: string }
        Returns: string
      }
      restore_job_application: {
        Args: { target_cleaner_id: string; target_job_id: string }
        Returns: undefined
      }
      revoke_employee_invitation: {
        Args: { target_company_id: string; target_invitation_id: string }
        Returns: undefined
      }
      revoke_first_admin_invitation: {
        Args: { target_invitation_id: string }
        Returns: undefined
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
      save_push_subscription: {
        Args: { auth: string; endpoint: string; p256dh: string }
        Returns: undefined
      }
      set_active_company: {
        Args: { target_company_id: string }
        Returns: string
      }
      set_preferred_locale: {
        Args: { target_locale: Database["public"]["Enums"]["app_locale"] }
        Returns: Database["public"]["Enums"]["app_locale"]
      }
      set_recurring_assignment_active: {
        Args: { target_active: boolean; target_recurring_assignment_id: string }
        Returns: undefined
      }
      set_site_preferred_cleaners: {
        Args: { cleaner_ids: string[]; target_site_id: string }
        Returns: undefined
      }
      update_cleaner_profile: {
        Args: { full_name: string; phone: string; suburb: string }
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
      app_locale: "en-AU" | "pt-BR"
      application_status: "applied" | "assigned" | "not_selected" | "withdrawn"
      assignment_source: "manual" | "recurring"
      company_status: "pending" | "approved" | "suspended"
      employee_role: "owner" | "staff"
      job_status:
        | "draft"
        | "posted"
        | "assigned"
        | "on_the_way"
        | "in_progress"
        | "completed"
        | "cancelled"
      ledger_status: "owed" | "paid"
      member_status: "active" | "removed"
      notification_type:
        | "job_assigned"
        | "job_posted"
        | "job_cancelled"
        | "application_received"
        | "payment_marked_paid"
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
      app_locale: ["en-AU", "pt-BR"],
      application_status: ["applied", "assigned", "not_selected", "withdrawn"],
      assignment_source: ["manual", "recurring"],
      company_status: ["pending", "approved", "suspended"],
      employee_role: ["owner", "staff"],
      job_status: [
        "draft",
        "posted",
        "assigned",
        "on_the_way",
        "in_progress",
        "completed",
        "cancelled",
      ],
      ledger_status: ["owed", "paid"],
      member_status: ["active", "removed"],
      notification_type: [
        "job_assigned",
        "job_posted",
        "job_cancelled",
        "application_received",
        "payment_marked_paid",
      ],
      recurrence_frequency: ["weekly", "fortnightly"],
    },
  },
} as const

