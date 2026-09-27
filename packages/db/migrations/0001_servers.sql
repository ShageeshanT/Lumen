CREATE TABLE "servers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'other' NOT NULL,
	"region_label" text,
	"public_ip" text,
	"mesh_ip" text,
	"container_subnet" text,
	"arch" text,
	"os" text,
	"os_version" text,
	"kernel" text,
	"hostname" text,
	"cpu_cores" integer,
	"memory_mb" integer,
	"disk_gb" integer,
	"docker_version" text,
	"agent_version" text,
	"agent_protocol_version" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"offline_since" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"wg_public_key" text,
	"monthly_cost" numeric(12, 2),
	"agent_public_key" text NOT NULL,
	"credential_hash" text NOT NULL,
	"previous_credential_hash" text,
	"previous_credential_expires_at" timestamp with time zone,
	"credential_rotation_requested_at" timestamp with time zone,
	"docker_ok" boolean,
	"caddy_ok" boolean,
	"disk_low" boolean DEFAULT false NOT NULL,
	"container_count" integer,
	"clock_skew_ms" integer,
	"desired_state_version" bigint DEFAULT 0 NOT NULL,
	"last_host_sample" jsonb,
	"port_check" jsonb,
	"agent_update" jsonb,
	"gateway_node" text,
	"gateway_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servers_status_check" CHECK ("servers"."status" in ('pending', 'online', 'offline', 'draining')),
	CONSTRAINT "servers_provider_check" CHECK ("servers"."provider" in ('oracle', 'aws', 'gcp', 'azure', 'hetzner', 'digitalocean', 'other'))
);
--> statement-breakpoint
CREATE TABLE "server_join_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"server_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_ops" (
	"server_id" text NOT NULL,
	"op_id" text NOT NULL,
	"kind" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_ops_server_id_op_id_pk" PRIMARY KEY("server_id","op_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"code" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"metadata" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "servers_workspace_idx" ON "servers" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "servers_status_heartbeat_idx" ON "servers" USING btree ("status","last_heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "server_join_tokens_hash_idx" ON "server_join_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "server_join_tokens_workspace_idx" ON "server_join_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_ops_received_idx" ON "agent_ops" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "notifications_workspace_idx" ON "notifications" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_target_idx" ON "notifications" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_idx" ON "audit_log" USING btree ("workspace_id","created_at");