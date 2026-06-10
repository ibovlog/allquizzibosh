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
      access_keys: {
        Row: {
          answers: Json
          assessment_id: string
          attempt_count: number
          blocked: boolean
          completed: boolean
          created_at: string
          current_index: number
          device_id: string | null
          id: string
          key_code: string
        }
        Insert: {
          answers?: Json
          assessment_id: string
          attempt_count?: number
          blocked?: boolean
          completed?: boolean
          created_at?: string
          current_index?: number
          device_id?: string | null
          id?: string
          key_code: string
        }
        Update: {
          answers?: Json
          assessment_id?: string
          attempt_count?: number
          blocked?: boolean
          completed?: boolean
          created_at?: string
          current_index?: number
          device_id?: string | null
          id?: string
          key_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_keys_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_messages: {
        Row: {
          assessment_id: string | null
          body: string
          created_at: string
          id: string
          kind: string
          seat_number: number | null
        }
        Insert: {
          assessment_id?: string | null
          body: string
          created_at?: string
          id?: string
          kind?: string
          seat_number?: number | null
        }
        Update: {
          assessment_id?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: string
          seat_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_messages_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_open: boolean
          login_mode: string
          max_attempts: number
          name: string
          order_mode: string
          question_count: number
          resume_after_unblock: boolean
          seat_max: number
          seat_min: number
          shuffle_options: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_open?: boolean
          login_mode?: string
          max_attempts?: number
          name: string
          order_mode?: string
          question_count?: number
          resume_after_unblock?: boolean
          seat_max?: number
          seat_min?: number
          shuffle_options?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_open?: boolean
          login_mode?: string
          max_attempts?: number
          name?: string
          order_mode?: string
          question_count?: number
          resume_after_unblock?: boolean
          seat_max?: number
          seat_min?: number
          shuffle_options?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          access_key: string | null
          answers: Json
          assessment_id: string
          attempt_count: number
          blocked: boolean
          completed: boolean
          created_at: string
          current_index: number
          device_id: string | null
          id: string
          seat_number: number
          updated_at: string
        }
        Insert: {
          access_key?: string | null
          answers?: Json
          assessment_id: string
          attempt_count?: number
          blocked?: boolean
          completed?: boolean
          created_at?: string
          current_index?: number
          device_id?: string | null
          id?: string
          seat_number: number
          updated_at?: string
        }
        Update: {
          access_key?: string | null
          answers?: Json
          assessment_id?: string
          attempt_count?: number
          blocked?: boolean
          completed?: boolean
          created_at?: string
          current_index?: number
          device_id?: string | null
          id?: string
          seat_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_reports: {
        Row: {
          access_key: string | null
          assessment_id: string
          created_at: string
          id: string
          pdf_number: number | null
          question_id: string | null
          question_text: string | null
          reason: string
          seat_number: number | null
          status: string
        }
        Insert: {
          access_key?: string | null
          assessment_id: string
          created_at?: string
          id?: string
          pdf_number?: number | null
          question_id?: string | null
          question_text?: string | null
          reason: string
          seat_number?: number | null
          status?: string
        }
        Update: {
          access_key?: string | null
          assessment_id?: string
          created_at?: string
          id?: string
          pdf_number?: number | null
          question_id?: string | null
          question_text?: string | null
          reason?: string
          seat_number?: number | null
          status?: string
        }
        Relationships: []
      }
      processing_errors: {
        Row: {
          assessment_id: string | null
          created_at: string
          file_name: string | null
          id: string
          question_id: string | null
          question_number: number | null
          raw_excerpt: string | null
          reason: string
          status: string
        }
        Insert: {
          assessment_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          question_id?: string | null
          question_number?: number | null
          raw_excerpt?: string | null
          reason: string
          status?: string
        }
        Update: {
          assessment_id?: string | null
          created_at?: string
          file_name?: string | null
          id?: string
          question_id?: string | null
          question_number?: number | null
          raw_excerpt?: string | null
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_errors_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_errors_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          assessment_id: string
          correct_index: number
          created_at: string
          id: string
          options: Json
          pdf_number: number | null
          position: number
          prompt: string
          source_file: string | null
        }
        Insert: {
          assessment_id: string
          correct_index?: number
          created_at?: string
          id?: string
          options?: Json
          pdf_number?: number | null
          position?: number
          prompt: string
          source_file?: string | null
        }
        Update: {
          assessment_id?: string
          correct_index?: number
          created_at?: string
          id?: string
          options?: Json
          pdf_number?: number | null
          position?: number
          prompt?: string
          source_file?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_results: {
        Row: {
          access_key: string | null
          assessment_id: string | null
          attempt_number: number
          blank_count: number | null
          created_at: string
          details: Json | null
          id: string
          score: number
          seat_number: number
          started_at: string | null
          total: number
        }
        Insert: {
          access_key?: string | null
          assessment_id?: string | null
          attempt_number?: number
          blank_count?: number | null
          created_at?: string
          details?: Json | null
          id?: string
          score: number
          seat_number: number
          started_at?: string | null
          total: number
        }
        Update: {
          access_key?: string | null
          assessment_id?: string | null
          attempt_number?: number
          blank_count?: number | null
          created_at?: string
          details?: Json | null
          id?: string
          score?: number
          seat_number?: number
          started_at?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
