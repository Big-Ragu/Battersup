export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      leagues: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          season_year: number;
          status: Database['public']['Enums']['league_status'];
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          season_year: number;
          status?: Database['public']['Enums']['league_status'];
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          season_year?: number;
          status?: Database['public']['Enums']['league_status'];
          updated_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          league_id: string;
          name: string;
          color: string | null;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          league_id: string;
          name: string;
          color?: string | null;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          league_id?: string;
          name?: string;
          color?: string | null;
          logo_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teams_league_id_fkey';
            columns: ['league_id'];
            isOneToOne: false;
            referencedRelation: 'leagues';
            referencedColumns: ['id'];
          },
        ];
      };
      fields: {
        Row: {
          id: string;
          league_id: string;
          name: string;
          address: string | null;
          diamond_count: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          league_id: string;
          name: string;
          address?: string | null;
          diamond_count?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          league_id?: string;
          name?: string;
          address?: string | null;
          diamond_count?: number;
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fields_league_id_fkey';
            columns: ['league_id'];
            isOneToOne: false;
            referencedRelation: 'leagues';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          league_id: string;
          team_id: string | null;
          role: Database['public']['Enums']['user_role_type'];
          assigned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          league_id: string;
          team_id?: string | null;
          role: Database['public']['Enums']['user_role_type'];
          assigned_at?: string;
        };
        Update: {
          user_id?: string;
          league_id?: string;
          team_id?: string | null;
          role?: Database['public']['Enums']['user_role_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles_league_id_fkey';
            columns: ['league_id'];
            isOneToOne: false;
            referencedRelation: 'leagues';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      signup_codes: {
        Row: {
          id: string;
          league_id: string;
          code: string;
          role: Database['public']['Enums']['user_role_type'];
          team_id: string | null;
          max_uses: number | null;
          use_count: number;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          league_id: string;
          code: string;
          role: Database['public']['Enums']['user_role_type'];
          team_id?: string | null;
          max_uses?: number | null;
          use_count?: number;
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          league_id?: string;
          code?: string;
          role?: Database['public']['Enums']['user_role_type'];
          team_id?: string | null;
          max_uses?: number | null;
          use_count?: number;
          expires_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'signup_codes_league_id_fkey';
            columns: ['league_id'];
            isOneToOne: false;
            referencedRelation: 'leagues';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signup_codes_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      league_status: 'draft' | 'active' | 'completed';
      user_role_type:
        | 'commissioner'
        | 'manager'
        | 'coach'
        | 'player'
        | 'parent'
        | 'fan';
    };
    CompositeTypes: Record<string, never>;
  };
}
