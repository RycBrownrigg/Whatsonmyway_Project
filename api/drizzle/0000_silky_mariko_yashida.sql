CREATE TABLE IF NOT EXISTS "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"apple_original_transaction_id" text NOT NULL,
	"apple_transaction_id" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "entitlements_user_id_pack_id_unique" UNIQUE("user_id","pack_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"pack_slug" text,
	"poi_name" text,
	"poi_address" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_row_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"error_code" text NOT NULL,
	"field" text,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_type_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"flagged_rows" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pack_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"data_type" text NOT NULL,
	"enum_options" jsonb,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pack_field_definitions_pack_id_field_key_unique" UNIQUE("pack_id","field_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pack_filter_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"filter_key" text NOT NULL,
	"label" text NOT NULL,
	"filter_type" text NOT NULL,
	"options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pack_filter_definitions_pack_id_filter_key_unique" UNIQUE("pack_id","filter_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pack_pois" (
	"pack_id" uuid NOT NULL,
	"poi_id" uuid NOT NULL,
	CONSTRAINT "pack_pois_pack_id_poi_id_pk" PRIMARY KEY("pack_id","poi_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pack_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"file_url" text NOT NULL,
	"checksum" text NOT NULL,
	"poi_count" integer NOT NULL,
	"changelog" text,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_versions_pack_id_version_unique" UNIQUE("pack_id","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"pack_type" text NOT NULL,
	"poi_type_id" uuid,
	"state_code" char(2),
	"apple_product_id" text NOT NULL,
	"price_tier" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "packs_apple_product_id_unique" UNIQUE("apple_product_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poi_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poi_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pois" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poi_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_street" text NOT NULL,
	"address_city" text NOT NULL,
	"address_state" char(2) NOT NULL,
	"address_zip" text NOT NULL,
	"phone" text,
	"website" text,
	"additional_info" text,
	"latitude" double precision,
	"longitude" double precision,
	"geocode_status" text DEFAULT 'pending' NOT NULL,
	"geocode_confidence" double precision,
	"geocode_candidates" jsonb,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"filter_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apple_sub" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_apple_sub_unique" UNIQUE("apple_sub")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_submissions" ADD CONSTRAINT "feedback_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "import_row_errors" ADD CONSTRAINT "import_row_errors_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "imports" ADD CONSTRAINT "imports_poi_type_id_poi_types_id_fk" FOREIGN KEY ("poi_type_id") REFERENCES "public"."poi_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pack_field_definitions" ADD CONSTRAINT "pack_field_definitions_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pack_filter_definitions" ADD CONSTRAINT "pack_filter_definitions_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pack_pois" ADD CONSTRAINT "pack_pois_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pack_pois" ADD CONSTRAINT "pack_pois_poi_id_pois_id_fk" FOREIGN KEY ("poi_id") REFERENCES "public"."pois"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pack_versions" ADD CONSTRAINT "pack_versions_pack_id_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."packs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "packs" ADD CONSTRAINT "packs_poi_type_id_poi_types_id_fk" FOREIGN KEY ("poi_type_id") REFERENCES "public"."poi_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pois" ADD CONSTRAINT "pois_poi_type_id_poi_types_id_fk" FOREIGN KEY ("poi_type_id") REFERENCES "public"."poi_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pois_poi_type_idx" ON "pois" USING btree ("poi_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pois_state_idx" ON "pois" USING btree ("address_state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pois_lat_lng_idx" ON "pois" USING btree ("latitude","longitude");