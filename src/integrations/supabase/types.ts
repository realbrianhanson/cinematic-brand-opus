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
    PostgrestVersion: "14.4"
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
      content_opportunities: {
        Row: {
          angle: string
          attempts: number
          brief: Json | null
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
      posts: {
        Row: {
          category_id: string | null
          content: string | null
          created_at: string
          embedding: string | null
          excerpt: string | null
          fact_check: Json | null
          fact_checked_at: string | null
          faq_items: Json | null
          featured_image: string | null
          featured_image_alt: string | null
          freshness_hours: number | null
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
          quality_score: number | null
          reading_time: number | null
          scheduled_at: string | null
          slug: string
          source_citations: Json | null
          status: string
          title: string
          tldr: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          embedding?: string | null
          excerpt?: string | null
          fact_check?: Json | null
          fact_checked_at?: string | null
          faq_items?: Json | null
          featured_image?: string | null
          featured_image_alt?: string | null
          freshness_hours?: number | null
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
          quality_score?: number | null
          reading_time?: number | null
          scheduled_at?: string | null
          slug: string
          source_citations?: Json | null
          status?: string
          title: string
          tldr?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          content?: string | null
          created_at?: string
          embedding?: string | null
          excerpt?: string | null
          fact_check?: Json | null
          fact_checked_at?: string | null
          faq_items?: Json | null
          featured_image?: string | null
          featured_image_alt?: string | null
          freshness_hours?: number | null
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
          quality_score?: number | null
          reading_time?: number | null
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
      site_settings: {
        Row: {
          author_bio: string | null
          author_credentials: string[] | null
          author_name: string
          author_social_links: Json | null
          author_title: string | null
          auto_publish_daily_cap: number
          auto_publish_enabled: boolean
          auto_publish_min_quality: number
          banned_phrases: string[] | null
          cta_button_text: string | null
          cta_headline: string | null
          cta_social_proof: string | null
          cta_subtext: string | null
          cta_url: string | null
          default_expert_pov: string | null
          id: string
          image_generation_enabled: boolean
          publisher_name: string | null
          publisher_url: string | null
          site_name: string
          site_url: string
          updated_at: string | null
          voice_profile: string | null
        }
        Insert: {
          author_bio?: string | null
          author_credentials?: string[] | null
          author_name?: string
          author_social_links?: Json | null
          author_title?: string | null
          auto_publish_daily_cap?: number
          auto_publish_enabled?: boolean
          auto_publish_min_quality?: number
          banned_phrases?: string[] | null
          cta_button_text?: string | null
          cta_headline?: string | null
          cta_social_proof?: string | null
          cta_subtext?: string | null
          cta_url?: string | null
          default_expert_pov?: string | null
          id?: string
          image_generation_enabled?: boolean
          publisher_name?: string | null
          publisher_url?: string | null
          site_name?: string
          site_url?: string
          updated_at?: string | null
          voice_profile?: string | null
        }
        Update: {
          author_bio?: string | null
          author_credentials?: string[] | null
          author_name?: string
          author_social_links?: Json | null
          author_title?: string | null
          auto_publish_daily_cap?: number
          auto_publish_enabled?: boolean
          auto_publish_min_quality?: number
          banned_phrases?: string[] | null
          cta_button_text?: string | null
          cta_headline?: string | null
          cta_social_proof?: string | null
          cta_subtext?: string | null
          cta_url?: string | null
          default_expert_pov?: string | null
          id?: string
          image_generation_enabled?: boolean
          publisher_name?: string | null
          publisher_url?: string | null
          site_name?: string
          site_url?: string
          updated_at?: string | null
          voice_profile?: string | null
        }
        Relationships: []
      }
      site_settings_private: {
        Row: {
          created_at: string
          id: string
          report_email: string | null
          report_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_email?: string | null
          report_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          report_email?: string | null
          report_enabled?: boolean | null
          updated_at?: string
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
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
      top_pages_by_views: {
        Args: { limit_count?: number }
        Returns: {
          title: string
          view_count: number
        }[]
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
      app_role: ["admin", "user"],
    },
  },
} as const
