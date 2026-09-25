export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_preferences: {
        Row: {
          created_at: string
          id: string
          theme: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_offer_routes: {
        Row: {
          button_text: string
          headline: string
          id: string
          label: string
          match_key: string
          offer_id: string
          scope: string
          subtext: string
          updated_at: string
        }
        Insert: {
          button_text?: string
          headline?: string
          id?: string
          label: string
          match_key: string
          offer_id: string
          scope: string
          subtext?: string
          updated_at?: string
        }
        Update: {
          button_text?: string
          headline?: string
          id?: string
          label?: string
          match_key?: string
          offer_id?: string
          scope?: string
          subtext?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_offer_routes_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      content_opportunities: {
        Row: {
          angle: string
          attempts: number
          brief: Json | null
          claim_started: boolean
          claim_token: string | null
          created_at: string
          gap_reason: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          opportunity_score: number
          rationale: string | null
          reject_reason: string | null
          serp_snapshot: Json | null
          source_item_ids: string[]
          status: string
          target_keyword: string | null
          topic_lane: string
          updated_at: string
        }
        Insert: {
          angle: string
          attempts?: number
          brief?: Json | null
          claim_started?: boolean
          claim_token?: string | null
          created_at?: string
          gap_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          opportunity_score?: number
          rationale?: string | null
          reject_reason?: string | null
          serp_snapshot?: Json | null
          source_item_ids?: string[]
          status?: string
          target_keyword?: string | null
          topic_lane: string
          updated_at?: string
        }
        Update: {
          angle?: string
          attempts?: number
          brief?: Json | null
          claim_started?: boolean
          claim_token?: string | null
          created_at?: string
          gap_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          opportunity_score?: number
          rationale?: string | null
          reject_reason?: string | null
          serp_snapshot?: Json | null
          source_item_ids?: string[]
          status?: string
          target_keyword?: string | null
          topic_lane?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_schemas: {
        Row: {
          created_at: string | null
          description: string | null
          description_template: string | null
          id: string
          is_active: boolean | null
          items_per_section: number | null
          name: string
          renderer_component: string
          schema_definition: Json
          slug: string
          title_template: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          items_per_section?: number | null
          name: string
          renderer_component: string
          schema_definition: Json
          slug: string
          title_template: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          items_per_section?: number | null
          name?: string
          renderer_component?: string
          schema_definition?: Json
          slug?: string
          title_template?: string
        }
        Relationships: []
      }
      content_sources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          last_polled_at: string | null
          name: string
          topic_lane: string
          updated_at: string
          url: string | null
          weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          last_polled_at?: string | null
          name: string
          topic_lane: string
          updated_at?: string
          url?: string | null
          weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          last_polled_at?: string | null
          name?: string
          topic_lane?: string
          updated_at?: string
          url?: string | null
          weight?: number
        }
        Relationships: []
      }
      conversion_events: {
        Row: {
          created_at: string
          destination: string | null
          id: string
          offer_id: string | null
          path: string
          placement: string | null
          project: string | null
          session_id: string
          type: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          id: string
          offer_id?: string | null
          path: string
          placement?: string | null
          project?: string | null
          session_id: string
          type: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          id?: string
          offer_id?: string | null
          path?: string
          placement?: string | null
          project?: string | null
          session_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversion_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_measurement_config: {
        Row: {
          singleton: boolean
          started_at: string
        }
        Insert: {
          singleton?: boolean
          started_at?: string
        }
        Update: {
          singleton?: boolean
          started_at?: string
        }
        Relationships: []
      }
      conversion_order_facts: {
        Row: {
          created_at: string
          first_download_at: string | null
          order_id: string
          payment_mode: string
        }
        Insert: {
          created_at?: string
          first_download_at?: string | null
          order_id: string
          payment_mode: string
        }
        Update: {
          created_at?: string
          first_download_at?: string | null
          order_id?: string
          payment_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_order_facts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "offer_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_order_links: {
        Row: {
          created_at: string
          order_id: string
          session_id: string
        }
        Insert: {
          created_at?: string
          order_id: string
          session_id: string
        }
        Update: {
          created_at?: string
          order_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_order_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "offer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_order_links_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversion_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_sessions: {
        Row: {
          campaign: string
          id: string
          last_seen_at: string
          medium: string
          revoked_at: string | null
          source: string
          started_at: string
          token_hash: string
        }
        Insert: {
          campaign: string
          id: string
          last_seen_at?: string
          medium: string
          revoked_at?: string | null
          source: string
          started_at?: string
          token_hash: string
        }
        Update: {
          campaign?: string
          id?: string
          last_seen_at?: string
          medium?: string
          revoked_at?: string | null
          source?: string
          started_at?: string
          token_hash?: string
        }
        Relationships: []
      }
      cta_events: {
        Row: {
          content_type_slug: string | null
          created_at: string | null
          cta_variant: string | null
          event_type: string | null
          id: string
          niche_slug: string | null
          page_id: string | null
          page_type: string | null
        }
        Insert: {
          content_type_slug?: string | null
          created_at?: string | null
          cta_variant?: string | null
          event_type?: string | null
          id?: string
          niche_slug?: string | null
          page_id?: string | null
          page_type?: string | null
        }
        Update: {
          content_type_slug?: string | null
          created_at?: string | null
          cta_variant?: string | null
          event_type?: string | null
          id?: string
          niche_slug?: string | null
          page_id?: string | null
          page_type?: string | null
        }
        Relationships: []
      }
      expert_notes: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          note: string
          topic_hint: string | null
          used_in_post_id: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          note: string
          topic_hint?: string | null
          used_in_post_id?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          note?: string
          topic_hint?: string | null
          used_in_post_id?: string | null
        }
        Relationships: []
      }
      external_conversion_imports: {
        Row: {
          id: string
          imported_at: string
          imported_by: string
          inserted: number
          reference: string
          row_count: number
          stale: number
          unchanged: number
          updated: number
        }
        Insert: {
          id?: string
          imported_at?: string
          imported_by: string
          inserted: number
          reference: string
          row_count: number
          stale: number
          unchanged: number
          updated: number
        }
        Update: {
          id?: string
          imported_at?: string
          imported_by?: string
          inserted?: number
          reference?: string
          row_count?: number
          stale?: number
          unchanged?: number
          updated?: number
        }
        Relationships: []
      }
      external_conversion_outcomes: {
        Row: {
          amount_minor: number | null
          campaign: string | null
          currency: string | null
          destination: string
          first_imported_at: string
          imported_by: string
          last_imported_at: string
          medium: string | null
          mode: string
          occurred_at: string
          outcome: string
          provider: string
          provider_updated_at: string
          record_id: string
          source: string | null
          status: string
        }
        Insert: {
          amount_minor?: number | null
          campaign?: string | null
          currency?: string | null
          destination: string
          first_imported_at?: string
          imported_by: string
          last_imported_at?: string
          medium?: string | null
          mode: string
          occurred_at: string
          outcome: string
          provider: string
          provider_updated_at: string
          record_id: string
          source?: string | null
          status: string
        }
        Update: {
          amount_minor?: number | null
          campaign?: string | null
          currency?: string | null
          destination?: string
          first_imported_at?: string
          imported_by?: string
          last_imported_at?: string
          medium?: string | null
          mode?: string
          occurred_at?: string
          outcome?: string
          provider?: string
          provider_updated_at?: string
          record_id?: string
          source?: string | null
          status?: string
        }
        Relationships: []
      }
      generated_page_revisions: {
        Row: {
          actor_id: string | null
          change_source: string
          created_at: string
          id: string
          page_id: string
          snapshot: Json
        }
        Insert: {
          actor_id?: string | null
          change_source: string
          created_at?: string
          id?: string
          page_id: string
          snapshot: Json
        }
        Update: {
          actor_id?: string | null
          change_source?: string
          created_at?: string
          id?: string
          page_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "generated_page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "generated_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_pages: {
        Row: {
          content_json: Json
          content_schema_id: string | null
          created_at: string | null
          generation_cost: number | null
          generation_model: string | null
          human_edited: boolean
          id: string
          keyword_difficulty: string | null
          last_refreshed: string | null
          lint_flags: Json | null
          niche_id: string | null
          performance_trend: string | null
          publish_override: boolean
          publish_override_at: string | null
          publish_override_by: string | null
          publish_override_reason: string | null
          published_at: string | null
          quality_score: number | null
          refresh_count: number | null
          schema_markup: Json | null
          seo_meta: Json | null
          silo_niche_id: string | null
          slug: string
          status: string | null
          target_keyword: string | null
          title: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          content_json: Json
          content_schema_id?: string | null
          created_at?: string | null
          generation_cost?: number | null
          generation_model?: string | null
          human_edited?: boolean
          id?: string
          keyword_difficulty?: string | null
          last_refreshed?: string | null
          lint_flags?: Json | null
          niche_id?: string | null
          performance_trend?: string | null
          publish_override?: boolean
          publish_override_at?: string | null
          publish_override_by?: string | null
          publish_override_reason?: string | null
          published_at?: string | null
          quality_score?: number | null
          refresh_count?: number | null
          schema_markup?: Json | null
          seo_meta?: Json | null
          silo_niche_id?: string | null
          slug: string
          status?: string | null
          target_keyword?: string | null
          title: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          content_json?: Json
          content_schema_id?: string | null
          created_at?: string | null
          generation_cost?: number | null
          generation_model?: string | null
          human_edited?: boolean
          id?: string
          keyword_difficulty?: string | null
          last_refreshed?: string | null
          lint_flags?: Json | null
          niche_id?: string | null
          performance_trend?: string | null
          publish_override?: boolean
          publish_override_at?: string | null
          publish_override_by?: string | null
          publish_override_reason?: string | null
          published_at?: string | null
          quality_score?: number | null
          refresh_count?: number | null
          schema_markup?: Json | null
          seo_meta?: Json | null
          silo_niche_id?: string | null
          slug?: string
          status?: string | null
          target_keyword?: string | null
          title?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_pages_content_schema_id_fkey"
            columns: ["content_schema_id"]
            isOneToOne: false
            referencedRelation: "content_schemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_pages_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_pages_silo_niche_id_fkey"
            columns: ["silo_niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          batch_id: string
          completed_count: number
          created_at: string
          error_message: string | null
          failed_count: number
          id: string
          request_payload: Json
          result_summary: Json | null
          serp_snapshot: Json | null
          skipped_count: number
          status: string
          success_count: number
          total_combinations: number
          updated_at: string
          work_queue: Json | null
        }
        Insert: {
          batch_id: string
          completed_count?: number
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          request_payload?: Json
          result_summary?: Json | null
          serp_snapshot?: Json | null
          skipped_count?: number
          status?: string
          success_count?: number
          total_combinations?: number
          updated_at?: string
          work_queue?: Json | null
        }
        Update: {
          batch_id?: string
          completed_count?: number
          created_at?: string
          error_message?: string | null
          failed_count?: number
          id?: string
          request_payload?: Json
          result_summary?: Json | null
          serp_snapshot?: Json | null
          skipped_count?: number
          status?: string
          success_count?: number
          total_combinations?: number
          updated_at?: string
          work_queue?: Json | null
        }
        Relationships: []
      }
      generation_logs: {
        Row: {
          batch_id: string | null
          cost: number | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          generated_page_id: string | null
          id: string
          status: string | null
          tokens_used: number | null
        }
        Insert: {
          batch_id?: string | null
          cost?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          generated_page_id?: string | null
          id?: string
          status?: string | null
          tokens_used?: number | null
        }
        Update: {
          batch_id?: string | null
          cost?: number | null
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          generated_page_id?: string | null
          id?: string
          status?: string | null
          tokens_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_logs_generated_page_id_fkey"
            columns: ["generated_page_id"]
            isOneToOne: false
            referencedRelation: "generated_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_import_rows: {
        Row: {
          clicks: number
          ctr: number
          import_id: string
          impressions: number
          page_url: string
          position: number
          query: string
          row_number: number
        }
        Insert: {
          clicks: number
          ctr: number
          import_id: string
          impressions: number
          page_url: string
          position: number
          query: string
          row_number: number
        }
        Update: {
          clicks?: number
          ctr?: number
          import_id?: string
          impressions?: number
          page_url?: string
          position?: number
          query?: string
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "gsc_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "gsc_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      gsc_imports: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          period_end: string
          period_start: string
          property: string
          row_count: number | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          period_end: string
          period_start: string
          property: string
          row_count?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          period_end?: string
          period_start?: string
          property?: string
          row_count?: number | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      gsc_performance: {
        Row: {
          clicks: number
          ctr: number
          fetched_at: string
          id: string
          impressions: number
          page_url: string
          period_end: string
          period_start: string
          position: number
          query: string
        }
        Insert: {
          clicks?: number
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          page_url: string
          period_end: string
          period_start: string
          position?: number
          query: string
        }
        Update: {
          clicks?: number
          ctr?: number
          fetched_at?: string
          id?: string
          impressions?: number
          page_url?: string
          period_end?: string
          period_start?: string
          position?: number
          query?: string
        }
        Relationships: []
      }
      indexing_log: {
        Row: {
          checked_at: string | null
          error_message: string | null
          id: string
          indexed_at: string | null
          method: string | null
          page_id: string | null
          page_url: string
          status: string | null
          submitted_at: string | null
        }
        Insert: {
          checked_at?: string | null
          error_message?: string | null
          id?: string
          indexed_at?: string | null
          method?: string | null
          page_id?: string | null
          page_url: string
          status?: string | null
          submitted_at?: string | null
        }
        Update: {
          checked_at?: string | null
          error_message?: string | null
          id?: string
          indexed_at?: string | null
          method?: string | null
          page_id?: string | null
          page_url?: string
          status?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indexing_log_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "generated_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_links: {
        Row: {
          anchor_text: string
          created_at: string | null
          id: string
          link_type: string
          position: string | null
          source_page_id: string
          source_page_type: string
          target_page_id: string
          target_page_type: string
        }
        Insert: {
          anchor_text: string
          created_at?: string | null
          id?: string
          link_type: string
          position?: string | null
          source_page_id: string
          source_page_type: string
          target_page_id: string
          target_page_type: string
        }
        Update: {
          anchor_text?: string
          created_at?: string | null
          id?: string
          link_type?: string
          position?: string | null
          source_page_id?: string
          source_page_type?: string
          target_page_id?: string
          target_page_type?: string
        }
        Relationships: []
      }
      jev_shadow_scores: {
        Row: {
          audience_fit_score: number | null
          created_at: string
          duplicate_prob: number | null
          error: string | null
          id: string
          latency_ms: number | null
          model: string
          questions_version: string
          raw: Json | null
          relevant_prob: number | null
          subject_id: string
          subject_type: string
          substance_prob: number | null
          verdict: string | null
        }
        Insert: {
          audience_fit_score?: number | null
          created_at?: string
          duplicate_prob?: number | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          model: string
          questions_version: string
          raw?: Json | null
          relevant_prob?: number | null
          subject_id: string
          subject_type: string
          substance_prob?: number | null
          verdict?: string | null
        }
        Update: {
          audience_fit_score?: number | null
          created_at?: string
          duplicate_prob?: number | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string
          questions_version?: string
          raw?: Json | null
          relevant_prob?: number | null
          subject_id?: string
          subject_type?: string
          substance_prob?: number | null
          verdict?: string | null
        }
        Relationships: []
      }
      keyword_assignments: {
        Row: {
          created_at: string | null
          id: string
          page_id: string | null
          primary_keyword: string
          secondary_keywords: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          page_id?: string | null
          primary_keyword: string
          secondary_keywords?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          page_id?: string | null
          primary_keyword?: string
          secondary_keywords?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "keyword_assignments_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "generated_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      link_clicks: {
        Row: {
          clicked_at: string | null
          id: string
          internal_link_id: string | null
        }
        Insert: {
          clicked_at?: string | null
          id?: string
          internal_link_id?: string | null
        }
        Update: {
          clicked_at?: string | null
          id?: string
          internal_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "link_clicks_internal_link_id_fkey"
            columns: ["internal_link_id"]
            isOneToOne: false
            referencedRelation: "internal_links"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          created_at: string
          file_path: string
          id: string
          mime_type: string | null
          name: string
          size: number | null
          type: string
          url: string
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          mime_type?: string | null
          name: string
          size?: number | null
          type: string
          url: string
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          name?: string
          size?: number | null
          type?: string
          url?: string
        }
        Relationships: []
      }
      newsletter_deliveries: {
        Row: {
          attempt_id: string | null
          attempted_at: string | null
          confirm_token: string
          detail: string | null
          email: string
          id: string
          provider_id: string | null
          provider_status: number | null
          send_id: string
          status: string
          subscriber_id: string
        }
        Insert: {
          attempt_id?: string | null
          attempted_at?: string | null
          confirm_token: string
          detail?: string | null
          email: string
          id?: string
          provider_id?: string | null
          provider_status?: number | null
          send_id: string
          status?: string
          subscriber_id: string
        }
        Update: {
          attempt_id?: string | null
          attempted_at?: string | null
          confirm_token?: string
          detail?: string | null
          email?: string
          id?: string
          provider_id?: string | null
          provider_status?: number | null
          send_id?: string
          status?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_deliveries_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "newsletter_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_deliveries_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_rate_limits: {
        Row: {
          bucket_key: string
          hits: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      newsletter_sends: {
        Row: {
          claimed_at: string | null
          created_at: string
          delivery_lease: string | null
          delivery_lease_until: string | null
          delivery_template: Json | null
          id: string
          idempotency_key: string | null
          intro: string | null
          last_error: string | null
          last_error_at: string | null
          last_error_status: number | null
          post_blurbs: Json | null
          post_ids: string[]
          recipient_count: number
          sent_count: number
          status: string
          subject: string | null
          updated_at: string
          week_key: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          delivery_lease?: string | null
          delivery_lease_until?: string | null
          delivery_template?: Json | null
          id?: string
          idempotency_key?: string | null
          intro?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_status?: number | null
          post_blurbs?: Json | null
          post_ids?: string[]
          recipient_count?: number
          sent_count?: number
          status?: string
          subject?: string | null
          updated_at?: string
          week_key: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          delivery_lease?: string | null
          delivery_lease_until?: string | null
          delivery_template?: Json | null
          id?: string
          idempotency_key?: string | null
          intro?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_error_status?: number | null
          post_blurbs?: Json | null
          post_ids?: string[]
          recipient_count?: number
          sent_count?: number
          status?: string
          subject?: string | null
          updated_at?: string
          week_key?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          confirm_token: string
          confirmation_send_count: number
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          last_confirmation_sent_at: string | null
          source: string | null
          status: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          confirm_token?: string
          confirmation_send_count?: number
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          last_confirmation_sent_at?: string | null
          source?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          confirm_token?: string
          confirmation_send_count?: number
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          last_confirmation_sent_at?: string | null
          source?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      niches: {
        Row: {
          context: Json
          created_at: string | null
          expert_pov: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_niche_id: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          context?: Json
          created_at?: string | null
          expert_pov?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_niche_id?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          context?: Json
          created_at?: string | null
          expert_pov?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_niche_id?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "niches_parent_niche_id_fkey"
            columns: ["parent_niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      not_found_hits: {
        Row: {
          first_seen: string
          hits: number
          last_referrer: string | null
          last_seen: string
          last_user_agent_class: string
          path: string
        }
        Insert: {
          first_seen?: string
          hits?: number
          last_referrer?: string | null
          last_seen?: string
          last_user_agent_class?: string
          path: string
        }
        Update: {
          first_seen?: string
          hits?: number
          last_referrer?: string | null
          last_seen?: string
          last_user_agent_class?: string
          path?: string
        }
        Relationships: []
      }
      offer_access_deliveries: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          email: string
          first_attempt_at: string | null
          id: string
          kind: string
          last_attempt_at: string | null
          last_error: string | null
          last_error_detail: string | null
          last_provider_status: number | null
          lease_id: string | null
          lease_until: string | null
          next_attempt_at: string
          order_ids: string[]
          payload_cipher: string | null
          provider_id: string | null
          sent_at: string | null
          status: string
          uncertain_since: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          email: string
          first_attempt_at?: string | null
          id?: string
          kind: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_detail?: string | null
          last_provider_status?: number | null
          lease_id?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          order_ids: string[]
          payload_cipher?: string | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          uncertain_since?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          email?: string
          first_attempt_at?: string | null
          id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_error_detail?: string | null
          last_provider_status?: number | null
          lease_id?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          order_ids?: string[]
          payload_cipher?: string | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          uncertain_since?: string | null
        }
        Relationships: []
      }
      offer_access_grants: {
        Row: {
          delivery_id: string
          expires_at: string
          order_id: string
          token_hash: string
        }
        Insert: {
          delivery_id: string
          expires_at: string
          order_id: string
          token_hash: string
        }
        Update: {
          delivery_id?: string
          expires_at?: string
          order_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_access_grants_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "offer_access_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_access_grants_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "offer_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_builder_drafts: {
        Row: {
          base_offer_updated_at: string
          document: Json
          offer_id: string
          updated_at: string
          version: number
        }
        Insert: {
          base_offer_updated_at: string
          document: Json
          offer_id: string
          updated_at?: string
          version: number
        }
        Update: {
          base_offer_updated_at?: string
          document?: Json
          offer_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_builder_drafts_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_builder_revisions: {
        Row: {
          created_at: string
          document: Json
          expected_draft_version: number | null
          expected_offer_updated_at: string | null
          id: string
          offer_id: string
          published: boolean
          request_id: string
          result: Json
          version: number
        }
        Insert: {
          created_at?: string
          document: Json
          expected_draft_version?: number | null
          expected_offer_updated_at?: string | null
          id?: string
          offer_id: string
          published: boolean
          request_id: string
          result: Json
          version: number
        }
        Update: {
          created_at?: string
          document?: Json
          expected_draft_version?: number | null
          expected_offer_updated_at?: string | null
          id?: string
          offer_id?: string
          published?: boolean
          request_id?: string
          result?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_builder_revisions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_checkout_attempts: {
        Row: {
          attempt: number
          checkout_expires_at: string
          order_id: string
          recorded_at: string
          retired_at: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          unpaid_verified_at: string | null
        }
        Insert: {
          attempt: number
          checkout_expires_at: string
          order_id: string
          recorded_at?: string
          retired_at?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          unpaid_verified_at?: string | null
        }
        Update: {
          attempt?: number
          checkout_expires_at?: string
          order_id?: string
          recorded_at?: string
          retired_at?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          unpaid_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_checkout_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "offer_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_copy_usage: {
        Row: {
          admin_id: string
          requested_at: string
        }
        Insert: {
          admin_id: string
          requested_at?: string
        }
        Update: {
          admin_id?: string
          requested_at?: string
        }
        Relationships: []
      }
      offer_orders: {
        Row: {
          amount_minor: number
          asset_name_snapshot: string
          asset_path_snapshot: string
          checkout_attempt: number
          checkout_expires_at: string
          checkout_retry_origin: string | null
          checkout_retry_token_hash: string | null
          created_at: string
          currency: string
          declined_at: string | null
          email: string
          fulfilled_at: string | null
          id: string
          name: string
          next_offer_deadline: string | null
          next_offer_id: string | null
          next_offer_window_minutes: number
          offer_id: string
          parent_order_id: string | null
          status: string
          stripe_checkout_url: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          title_snapshot: string
          token_hash: string
        }
        Insert: {
          amount_minor: number
          asset_name_snapshot: string
          asset_path_snapshot: string
          checkout_attempt?: number
          checkout_expires_at: string
          checkout_retry_origin?: string | null
          checkout_retry_token_hash?: string | null
          created_at?: string
          currency: string
          declined_at?: string | null
          email: string
          fulfilled_at?: string | null
          id?: string
          name?: string
          next_offer_deadline?: string | null
          next_offer_id?: string | null
          next_offer_window_minutes?: number
          offer_id: string
          parent_order_id?: string | null
          status: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          title_snapshot: string
          token_hash: string
        }
        Update: {
          amount_minor?: number
          asset_name_snapshot?: string
          asset_path_snapshot?: string
          checkout_attempt?: number
          checkout_expires_at?: string
          checkout_retry_origin?: string | null
          checkout_retry_token_hash?: string | null
          created_at?: string
          currency?: string
          declined_at?: string | null
          email?: string
          fulfilled_at?: string | null
          id?: string
          name?: string
          next_offer_deadline?: string | null
          next_offer_id?: string | null
          next_offer_window_minutes?: number
          offer_id?: string
          parent_order_id?: string | null
          status?: string
          stripe_checkout_url?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          title_snapshot?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_orders_next_offer_id_fkey"
            columns: ["next_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_orders_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: true
            referencedRelation: "offer_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_proof_items: {
        Row: {
          approved: boolean
          attribution: string
          content: string
          created_at: string
          id: string
          kind: string
          notes: string
          source_url: string
          title: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          attribution?: string
          content?: string
          created_at?: string
          id?: string
          kind: string
          notes?: string
          source_url?: string
          title: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          attribution?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          notes?: string
          source_url?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      offer_stripe_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          affiliate_disclosure: string | null
          amount_minor: number
          asset_name: string | null
          asset_path: string | null
          body: string
          checkout_mode: string
          cover_url: string | null
          created_at: string
          currency: string
          external_button_text: string
          external_url: string | null
          funnel_only: boolean
          id: string
          is_affiliate: boolean
          kind: string
          next_offer_id: string | null
          next_offer_window_minutes: number
          presentation: Json | null
          price_display_mode: string
          shop_category: string
          shop_featured: boolean
          show_in_shop: boolean
          slug: string
          status: string
          summary: string
          thank_you_message: string
          title: string
          updated_at: string
        }
        Insert: {
          affiliate_disclosure?: string | null
          amount_minor?: number
          asset_name?: string | null
          asset_path?: string | null
          body?: string
          checkout_mode?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          external_button_text?: string
          external_url?: string | null
          funnel_only?: boolean
          id?: string
          is_affiliate?: boolean
          kind?: string
          next_offer_id?: string | null
          next_offer_window_minutes?: number
          presentation?: Json | null
          price_display_mode?: string
          shop_category?: string
          shop_featured?: boolean
          show_in_shop?: boolean
          slug: string
          status?: string
          summary?: string
          thank_you_message?: string
          title?: string
          updated_at?: string
        }
        Update: {
          affiliate_disclosure?: string | null
          amount_minor?: number
          asset_name?: string | null
          asset_path?: string | null
          body?: string
          checkout_mode?: string
          cover_url?: string | null
          created_at?: string
          currency?: string
          external_button_text?: string
          external_url?: string | null
          funnel_only?: boolean
          id?: string
          is_affiliate?: boolean
          kind?: string
          next_offer_id?: string | null
          next_offer_window_minutes?: number
          presentation?: Json | null
          price_display_mode?: string
          shop_category?: string
          shop_featured?: boolean
          show_in_shop?: boolean
          slug?: string
          status?: string
          summary?: string
          thank_you_message?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_next_offer_id_fkey"
            columns: ["next_offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      page_engagement: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          page_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          page_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          page_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_engagement_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "generated_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pillar_page_revisions: {
        Row: {
          actor_id: string | null
          change_source: string
          created_at: string
          id: string
          page_id: string
          snapshot: Json
        }
        Insert: {
          actor_id?: string | null
          change_source: string
          created_at?: string
          id?: string
          page_id: string
          snapshot: Json
        }
        Update: {
          actor_id?: string | null
          change_source?: string
          created_at?: string
          id?: string
          page_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "pillar_page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pillar_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pillar_pages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          niche_id: string | null
          published_at: string | null
          seo_meta: Json | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          niche_id?: string | null
          published_at?: string | null
          seo_meta?: Json | null
          slug: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          niche_id?: string | null
          published_at?: string | null
          seo_meta?: Json | null
          slug?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pillar_pages_niche_id_fkey"
            columns: ["niche_id"]
            isOneToOne: false
            referencedRelation: "niches"
            referencedColumns: ["id"]
          },
        ]
      }
      pillar_publish_overrides: {
        Row: {
          created_at: string
          id: string
          issues: string[]
          overridden_by: string | null
          pillar_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          issues?: string[]
          overridden_by?: string | null
          pillar_id: string
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          issues?: string[]
          overridden_by?: string | null
          pillar_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "pillar_publish_overrides_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "pillar_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      post_editor_drafts: {
        Row: {
          document_key: string
          snapshot: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          document_key: string
          snapshot: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          document_key?: string
          snapshot?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_publish_overrides: {
        Row: {
          created_at: string
          failures: Json
          id: string
          mode: string
          overridden_by: string
          post_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          failures?: Json
          id?: string
          mode: string
          overridden_by: string
          post_id: string
          reason: string
        }
        Update: {
          created_at?: string
          failures?: Json
          id?: string
          mode?: string
          overridden_by?: string
          post_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_publish_overrides_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_revisions: {
        Row: {
          created_at: string
          id: string
          post_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "post_revisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          auto_scheduled_at: string | null
          category_id: string | null
          content: string | null
          contradicted_count: number | null
          created_at: string
          draft_claim_token: string | null
          editorial_metadata: Json
          embedding: string | null
          excerpt: string | null
          fact_check: Json | null
          fact_checked_at: string | null
          faq_items: Json | null
          featured_image: string | null
          featured_image_alt: string | null
          freshness_hours: number | null
          held_at: string | null
          held_reason: string | null
          id: string
          key_takeaways: Json | null
          lint_flags: Json | null
          opportunity_id: string | null
          originality_score: number | null
          performance_grade: string | null
          publish_override: boolean
          publish_override_at: string | null
          publish_override_by: string | null
          publish_override_reason: string | null
          published_at: string | null
          quality_score: number | null
          reading_time: number | null
          schedule_checked_at: string | null
          schedule_checked_by: string | null
          scheduled_at: string | null
          slug: string
          source_citations: Json | null
          status: string
          title: string
          tldr: string | null
          updated_at: string
        }
        Insert: {
          auto_scheduled_at?: string | null
          category_id?: string | null
          content?: string | null
          contradicted_count?: number | null
          created_at?: string
          draft_claim_token?: string | null
          editorial_metadata?: Json
          embedding?: string | null
          excerpt?: string | null
          fact_check?: Json | null
          fact_checked_at?: string | null
          faq_items?: Json | null
          featured_image?: string | null
          featured_image_alt?: string | null
          freshness_hours?: number | null
          held_at?: string | null
          held_reason?: string | null
          id?: string
          key_takeaways?: Json | null
          lint_flags?: Json | null
          opportunity_id?: string | null
          originality_score?: number | null
          performance_grade?: string | null
          publish_override?: boolean
          publish_override_at?: string | null
          publish_override_by?: string | null
          publish_override_reason?: string | null
          published_at?: string | null
          quality_score?: number | null
          reading_time?: number | null
          schedule_checked_at?: string | null
          schedule_checked_by?: string | null
          scheduled_at?: string | null
          slug: string
          source_citations?: Json | null
          status?: string
          title: string
          tldr?: string | null
          updated_at?: string
        }
        Update: {
          auto_scheduled_at?: string | null
          category_id?: string | null
          content?: string | null
          contradicted_count?: number | null
          created_at?: string
          draft_claim_token?: string | null
          editorial_metadata?: Json
          embedding?: string | null
          excerpt?: string | null
          fact_check?: Json | null
          fact_checked_at?: string | null
          faq_items?: Json | null
          featured_image?: string | null
          featured_image_alt?: string | null
          freshness_hours?: number | null
          held_at?: string | null
          held_reason?: string | null
          id?: string
          key_takeaways?: Json | null
          lint_flags?: Json | null
          opportunity_id?: string | null
          originality_score?: number | null
          performance_grade?: string | null
          publish_override?: boolean
          publish_override_at?: string | null
          publish_override_by?: string | null
          publish_override_reason?: string | null
          published_at?: string | null
          quality_score?: number | null
          reading_time?: number | null
          schedule_checked_at?: string | null
          schedule_checked_by?: string | null
          scheduled_at?: string | null
          slug?: string
          source_citations?: Json | null
          status?: string
          title?: string
          tldr?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "content_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      redirect_rules: {
        Row: {
          created_at: string
          from_path: string
          hits: number
          id: string
          is_active: boolean
          last_hit_at: string | null
          note: string | null
          status_code: number
          to_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_path: string
          hits?: number
          id?: string
          is_active?: boolean
          last_hit_at?: string | null
          note?: string | null
          status_code?: number
          to_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_path?: string
          hits?: number
          id?: string
          is_active?: boolean
          last_hit_at?: string | null
          note?: string | null
          status_code?: number
          to_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_metadata: {
        Row: {
          created_at: string
          id: string
          keywords: string[] | null
          meta_description: string | null
          meta_title: string | null
          og_image: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          og_image?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          keywords?: string[] | null
          meta_description?: string | null
          meta_title?: string | null
          og_image?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_metadata_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      site_branding: {
        Row: {
          id: boolean
          settings: Json
          updated_at: string
        }
        Insert: {
          id?: boolean
          settings: Json
          updated_at?: string
        }
        Update: {
          id?: boolean
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          author_bio: string | null
          author_credentials: string[] | null
          author_name: string
          author_social_links: Json | null
          author_title: string | null
          cta_button_text: string | null
          cta_headline: string | null
          cta_social_proof: string | null
          cta_subtext: string | null
          cta_url: string | null
          id: string
          image_generation_enabled: boolean
          indexnow_key: string | null
          newsletter_from_address: string | null
          newsletter_postal_address: string | null
          newsletter_reply_to: string | null
          publisher_name: string | null
          publisher_url: string | null
          site_name: string
          site_url: string
          updated_at: string | null
        }
        Insert: {
          author_bio?: string | null
          author_credentials?: string[] | null
          author_name?: string
          author_social_links?: Json | null
          author_title?: string | null
          cta_button_text?: string | null
          cta_headline?: string | null
          cta_social_proof?: string | null
          cta_subtext?: string | null
          cta_url?: string | null
          id?: string
          image_generation_enabled?: boolean
          indexnow_key?: string | null
          newsletter_from_address?: string | null
          newsletter_postal_address?: string | null
          newsletter_reply_to?: string | null
          publisher_name?: string | null
          publisher_url?: string | null
          site_name?: string
          site_url?: string
          updated_at?: string | null
        }
        Update: {
          author_bio?: string | null
          author_credentials?: string[] | null
          author_name?: string
          author_social_links?: Json | null
          author_title?: string | null
          cta_button_text?: string | null
          cta_headline?: string | null
          cta_social_proof?: string | null
          cta_subtext?: string | null
          cta_url?: string | null
          id?: string
          image_generation_enabled?: boolean
          indexnow_key?: string | null
          newsletter_from_address?: string | null
          newsletter_postal_address?: string | null
          newsletter_reply_to?: string | null
          publisher_name?: string | null
          publisher_url?: string | null
          site_name?: string
          site_url?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      site_settings_private: {
        Row: {
          auto_publish_daily_cap: number
          auto_publish_enabled: boolean
          auto_publish_min_quality: number
          banned_phrases: string[]
          created_at: string
          default_expert_pov: string | null
          gsc_property: string | null
          id: string
          report_email: string | null
          report_enabled: boolean | null
          speaking_inquiries_enabled: boolean
          speaking_notification_email: string
          speaking_notifications_enabled: boolean
          updated_at: string
          voice_profile: string | null
        }
        Insert: {
          auto_publish_daily_cap?: number
          auto_publish_enabled?: boolean
          auto_publish_min_quality?: number
          banned_phrases?: string[]
          created_at?: string
          default_expert_pov?: string | null
          gsc_property?: string | null
          id?: string
          report_email?: string | null
          report_enabled?: boolean | null
          speaking_inquiries_enabled?: boolean
          speaking_notification_email?: string
          speaking_notifications_enabled?: boolean
          updated_at?: string
          voice_profile?: string | null
        }
        Update: {
          auto_publish_daily_cap?: number
          auto_publish_enabled?: boolean
          auto_publish_min_quality?: number
          banned_phrases?: string[]
          created_at?: string
          default_expert_pov?: string | null
          gsc_property?: string | null
          id?: string
          report_email?: string | null
          report_enabled?: boolean | null
          speaking_inquiries_enabled?: boolean
          speaking_notification_email?: string
          speaking_notifications_enabled?: boolean
          updated_at?: string
          voice_profile?: string | null
        }
        Relationships: []
      }
      site_setup_history: {
        Row: {
          actor: string | null
          branding: Json | null
          created_at: string
          id: number
          mode: string | null
          settings: Json
        }
        Insert: {
          actor?: string | null
          branding?: Json | null
          created_at?: string
          id?: number
          mode?: string | null
          settings: Json
        }
        Update: {
          actor?: string | null
          branding?: Json | null
          created_at?: string
          id?: number
          mode?: string | null
          settings?: Json
        }
        Relationships: []
      }
      source_items: {
        Row: {
          ai_summary: string | null
          ai_title: string | null
          author: string | null
          embedding: string | null
          engagement_score: number
          fetched_at: string
          full_content: string | null
          full_content_generated_at: string | null
          id: string
          image_url: string | null
          pipeline_status: string
          published_at: string | null
          raw_excerpt: string | null
          source_id: string | null
          source_name: string | null
          status: string
          title: string | null
          topic_lane: string | null
          url: string
        }
        Insert: {
          ai_summary?: string | null
          ai_title?: string | null
          author?: string | null
          embedding?: string | null
          engagement_score?: number
          fetched_at?: string
          full_content?: string | null
          full_content_generated_at?: string | null
          id?: string
          image_url?: string | null
          pipeline_status?: string
          published_at?: string | null
          raw_excerpt?: string | null
          source_id?: string | null
          source_name?: string | null
          status?: string
          title?: string | null
          topic_lane?: string | null
          url: string
        }
        Update: {
          ai_summary?: string | null
          ai_title?: string | null
          author?: string | null
          embedding?: string | null
          engagement_score?: number
          fetched_at?: string
          full_content?: string | null
          full_content_generated_at?: string | null
          id?: string
          image_url?: string | null
          pipeline_status?: string
          published_at?: string | null
          raw_excerpt?: string | null
          source_id?: string | null
          source_name?: string | null
          status?: string
          title?: string | null
          topic_lane?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "content_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      speaking_inquiries: {
        Row: {
          admin_notes: string
          audience: string
          created_at: string
          email: string
          event_date: string
          event_format: string
          event_name: string
          id: string
          message: string
          name: string
          payload_hash: string
          request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string
          audience?: string
          created_at?: string
          email: string
          event_date?: string
          event_format?: string
          event_name: string
          id?: string
          message?: string
          name: string
          payload_hash: string
          request_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string
          audience?: string
          created_at?: string
          email?: string
          event_date?: string
          event_format?: string
          event_name?: string
          id?: string
          message?: string
          name?: string
          payload_hash?: string
          request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      speaking_notification_deliveries: {
        Row: {
          attempts: number
          created_at: string
          first_attempt_at: string | null
          id: string
          inquiry_id: string
          kind: string
          last_attempt_at: string | null
          last_error: string | null
          lease_id: string | null
          lease_until: string | null
          next_attempt_at: string
          payload: Json | null
          provider_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          first_attempt_at?: string | null
          id?: string
          inquiry_id: string
          kind: string
          last_attempt_at?: string | null
          last_error?: string | null
          lease_id?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          first_attempt_at?: string | null
          id?: string
          inquiry_id?: string
          kind?: string
          last_attempt_at?: string | null
          last_error?: string | null
          lease_id?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          payload?: Json | null
          provider_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaking_notification_deliveries_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "speaking_inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_performance: {
        Row: {
          avg_clicks: number
          avg_impressions: number
          avg_position: number | null
          format: string | null
          id: string
          posts_count: number
          topic_lane: string
          updated_at: string
          weight: number
        }
        Insert: {
          avg_clicks?: number
          avg_impressions?: number
          avg_position?: number | null
          format?: string | null
          id?: string
          posts_count?: number
          topic_lane: string
          updated_at?: string
          weight?: number
        }
        Update: {
          avg_clicks?: number
          avg_impressions?: number
          avg_position?: number | null
          format?: string | null
          id?: string
          posts_count?: number
          topic_lane?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      transactional_email_suppressions: {
        Row: {
          created_at: string
          email: string
          reason: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          reason: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      widget_config: {
        Row: {
          config: Json | null
          created_at: string | null
          display_name: string
          id: string
          is_enabled: boolean | null
          sort_order: number | null
          updated_at: string | null
          widget_slug: string
          widget_zone: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          display_name: string
          id?: string
          is_enabled?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          widget_slug: string
          widget_zone: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_enabled?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          widget_slug?: string
          widget_zone?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _offer_apply_stripe_event_v1: {
        Args: {
          _amount_minor: number
          _currency: string
          _event_id: string
          _event_type: string
          _order_id: string
          _payment_intent_id: string
          _session_id: string
        }
        Returns: Json
      }
      _offer_record_checkout_v1: {
        Args: {
          _checkout_url: string
          _order_id: string
          _payment_intent_id?: string
          _session_id: string
        }
        Returns: Json
      }
      admin_content_breakdown: { Args: never; Returns: Json }
      admin_conversion_snapshot: { Args: { _days?: number }; Returns: Json }
      admin_external_conversion_snapshot: {
        Args: { _days?: number }
        Returns: Json
      }
      admin_import_external_conversions: {
        Args: { _reference: string; _rows: Json }
        Returns: Json
      }
      admin_indexnow_status: { Args: never; Returns: Json }
      admin_newsletter_audience: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      admin_offer_copy_allow: { Args: never; Returns: boolean }
      admin_overview_attention_item: {
        Args: {
          _count: number
          _detail: string
          _key: string
          _link: string
          _message: string
          _severity: string
        }
        Returns: Json
      }
      admin_overview_snapshot: { Args: never; Returns: Json }
      admin_page_view_counts: {
        Args: never
        Returns: {
          page_id: string
          views: number
        }[]
      }
      admin_performance_snapshot: { Args: { days?: number }; Returns: Json }
      admin_read_niches: {
        Args: never
        Returns: {
          context: Json
          created_at: string | null
          expert_pov: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_niche_id: string | null
          slug: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "niches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_read_site_settings: {
        Args: never
        Returns: {
          author_bio: string | null
          author_credentials: string[] | null
          author_name: string
          author_social_links: Json | null
          author_title: string | null
          cta_button_text: string | null
          cta_headline: string | null
          cta_social_proof: string | null
          cta_subtext: string | null
          cta_url: string | null
          id: string
          image_generation_enabled: boolean
          indexnow_key: string | null
          newsletter_from_address: string | null
          newsletter_postal_address: string | null
          newsletter_reply_to: string | null
          publisher_name: string | null
          publisher_url: string | null
          site_name: string
          site_url: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "site_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_save_site_settings: {
        Args: {
          _private_id: string
          _private_patch: Json
          _private_updated_at: string
          _public_id: string
          _public_patch: Json
          _public_updated_at: string
        }
        Returns: Json
      }
      admin_swap_widget_order: {
        Args: {
          _direction: string
          _first_id: string
          _first_order: number
          _second_id: string
          _second_order: number
        }
        Returns: Json
      }
      claim_speaking_notification: { Args: { _id: string }; Returns: Json }
      content_claim_opportunities: {
        Args: {
          _daily_cap: number
          _max: number
          _max_attempts?: number
          _stale_seconds?: number
        }
        Returns: {
          attempts: number
          claim_token: string
          id: string
        }[]
      }
      content_claim_opportunity: {
        Args: { _id: string; _stale_seconds?: number }
        Returns: {
          attempts: number
          id: string
        }[]
      }
      content_schedule_checked: { Args: { _post_id: string }; Returns: Json }
      content_start_draft: {
        Args: { _id: string; _token?: string }
        Returns: {
          attempts: number
          claim_token: string
          id: string
        }[]
      }
      conversion_bind_order: {
        Args: {
          _order_id: string
          _payment_mode: string
          _session_id?: string
          _token_hash?: string
        }
        Returns: boolean
      }
      conversion_cleanup: { Args: never; Returns: undefined }
      conversion_forget_session: {
        Args: { _session_id: string; _token_hash: string }
        Returns: undefined
      }
      conversion_record_download: {
        Args: { _order_id: string }
        Returns: undefined
      }
      conversion_record_events: {
        Args: {
          _attribution?: Json
          _events: Json
          _session_id: string
          _token_hash: string
        }
        Returns: boolean
      }
      conversion_record_payment_mode: {
        Args: { _order_id: string; _payment_mode: string }
        Returns: undefined
      }
      freeze_speaking_notification: {
        Args: { _id: string; _lease_id: string; _payload: Json }
        Returns: boolean
      }
      get_cron_invocation_secret: { Args: never; Returns: string }
      gsc_finish_import: {
        Args: { _expected_rows: number; _import_id: string }
        Returns: Json
      }
      indexnow_key_file: { Args: { candidate: string }; Returns: string }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_stalled_generation_jobs: {
        Args: { p_stall_minutes?: number }
        Returns: number
      }
      match_posts: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      match_source_items: {
        Args: { match_count?: number; query_embedding: string; since?: string }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      newsletter_claim_send: {
        Args: { _stale_seconds?: number; _week_key: string }
        Returns: {
          id: string
          idempotency_key: string
          intro: string
          post_blurbs: Json
          post_ids: string[]
          subject: string
        }[]
      }
      newsletter_next_delivery_batch: {
        Args: { _lease: string; _send_id: string }
        Returns: Json
      }
      newsletter_prepare_delivery: {
        Args: {
          _expected_updated_at: string
          _lease: string
          _send_id: string
          _template: Json
        }
        Returns: Json
      }
      newsletter_public_subscribe: {
        Args: { _cooldown_seconds: number; _email: string; _source: string }
        Returns: {
          state: string
          token: string
        }[]
      }
      newsletter_rate_limit_hit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      newsletter_record_delivery: {
        Args: {
          _attempt_id: string
          _detail?: string
          _lease: string
          _outcome: string
          _provider_ids?: Json
          _provider_status?: number
          _send_id: string
        }
        Returns: undefined
      }
      newsletter_retry_failed_delivery: {
        Args: { _send_id: string }
        Returns: Json
      }
      newsletter_settle_send: { Args: { _send_id: string }; Returns: string }
      normalize_redirect_path: { Args: { p_path: string }; Returns: string }
      offer_apply_stripe_event: {
        Args: {
          _amount_minor: number
          _checkout_attempt?: number
          _currency: string
          _event_id: string
          _event_type: string
          _order_id: string
          _payment_intent_id: string
          _session_id: string
        }
        Returns: Json
      }
      offer_builder_document_valid: {
        Args: { _document: Json }
        Returns: boolean
      }
      offer_builder_keys: {
        Args: { _keys: string[]; _value: Json }
        Returns: boolean
      }
      offer_builder_page_valid: {
        Args: { _page: Json; _public?: boolean }
        Returns: boolean
      }
      offer_builder_presentation_valid: {
        Args: { _presentation: Json; _public?: boolean }
        Returns: boolean
      }
      offer_builder_save: {
        Args: {
          _document: Json
          _expected_draft_version: number
          _expected_offer_updated_at: string
          _offer_id: string
          _publish: boolean
          _request_id: string
        }
        Returns: Json
      }
      offer_builder_text: {
        Args: { _limit: number; _value: Json }
        Returns: boolean
      }
      offer_claim_access_delivery: { Args: { _id: string }; Returns: Json }
      offer_decline_next: { Args: { _token_hash: string }; Returns: Json }
      offer_finish_access_delivery: {
        Args: {
          _error?: string
          _id: string
          _lease_id: string
          _provider_id?: string
        }
        Returns: boolean
      }
      offer_freeze_access_delivery: {
        Args: {
          _grants: Json
          _id: string
          _lease_id: string
          _payload_cipher: string
        }
        Returns: boolean
      }
      offer_prepare_access_delivery: {
        Args: { _email?: string; _order_id?: string }
        Returns: string
      }
      offer_prepare_checkout_retry: {
        Args: {
          _checkout_attempt: number
          _order_id: string
          _origin: string
          _payment_intent_id: string
          _session_id: string
          _token_hash: string
        }
        Returns: Json
      }
      offer_record_access_attempt: {
        Args: {
          _error?: string
          _error_detail?: string
          _id: string
          _lease_id: string
          _outcome: string
          _provider_id?: string
          _provider_status?: number
          _retry_after_seconds?: number
        }
        Returns: string
      }
      offer_record_checkout: {
        Args: {
          _checkout_attempt?: number
          _checkout_url: string
          _order_id: string
          _payment_intent_id?: string
          _session_id: string
        }
        Returns: Json
      }
      offer_requeue_access_delivery: { Args: { _id: string }; Returns: boolean }
      offer_reserve_order: {
        Args: {
          _email: string
          _name: string
          _offer_id: string
          _parent_hash?: string
          _token_hash: string
        }
        Returns: Json
      }
      offer_resolve_access_hash: {
        Args: { _token_hash: string }
        Returns: string
      }
      offer_valid_external_url: { Args: { _url: string }; Returns: boolean }
      public_resource_counts: {
        Args: never
        Returns: {
          content_schema_id: string
          page_count: number
        }[]
      }
      publish_pillar_page_with_override: {
        Args: { p_issues?: string[]; p_pillar_id: string; p_reason: string }
        Returns: {
          content: string
          created_at: string | null
          id: string
          niche_id: string | null
          published_at: string | null
          seo_meta: Json | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pillar_pages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      publish_pillar_page_with_override_v2: {
        Args: {
          p_expected_updated_at: string
          p_issues: string[]
          p_pillar_id: string
          p_reason: string
        }
        Returns: {
          content: string
          created_at: string | null
          id: string
          niche_id: string | null
          published_at: string | null
          seo_meta: Json | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "pillar_pages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_not_found: {
        Args: { p_path: string; p_referrer?: string; p_ua_class?: string }
        Returns: boolean
      }
      record_speaking_notification: {
        Args: {
          _error: string
          _id: string
          _lease_id: string
          _outcome: string
          _provider_id: string
        }
        Returns: boolean
      }
      record_transactional_email_suppression: {
        Args: { _email: string; _reason: string }
        Returns: boolean
      }
      redirect_path_eligible: { Args: { p_path: string }; Returns: boolean }
      resolve_content_offer: {
        Args: {
          _content_type_slug?: string
          _niche_slug?: string
          _page_key?: string
        }
        Returns: Json
      }
      resolve_redirect: {
        Args: { p_path: string }
        Returns: {
          status_code: number
          to_path: string
        }[]
      }
      save_site_branding: { Args: { value: Json }; Returns: undefined }
      search_public_library: {
        Args: { page?: number; term: string }
        Returns: Json
      }
      submit_speaking_inquiry: {
        Args: {
          _audience: string
          _email: string
          _event_date: string
          _event_format: string
          _event_name: string
          _message: string
          _name: string
          _payload_hash: string
          _request_id: string
        }
        Returns: boolean
      }
      top_pages_by_views: {
        Args: { limit_count?: number }
        Returns: {
          title: string
          view_count: number
        }[]
      }
      transactional_email_is_suppressed: {
        Args: { _email: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
