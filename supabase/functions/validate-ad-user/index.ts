import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { domainUser, password } = await req.json();

    if (!domainUser || !password) {
      return new Response(
        JSON.stringify({ error: "Usuario y contraseña son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate format DOM\usuario
    if (!domainUser.includes("\\")) {
      return new Response(
        JSON.stringify({ error: "Formato inválido. Debe ser DOMINIO\\usuario" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // In production, this would validate against actual AD
    // For now, we simulate AD validation
    // TODO: Integrate with actual AD/LDAP service
    const isValidADCredentials = await validateActiveDirectory(domainUser, password);

    if (!isValidADCredentials) {
      return new Response(
        JSON.stringify({ error: "Credenciales de Active Directory inválidas" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check whitelist in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if user is in allowed_users table
    const { data: allowedUser, error: userError } = await supabase
      .from("allowed_users")
      .select("*")
      .eq("domain_user", domainUser)
      .eq("active", true)
      .single();

    if (userError || !allowedUser) {
      return new Response(
        JSON.stringify({ 
          allowed: false, 
          error: "Usuario no autorizado en la aplicación" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user roles
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("domain_user", domainUser);

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
      return new Response(
        JSON.stringify({ error: "Error al obtener roles del usuario" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roles = userRoles?.map(r => r.role) || [];

    return new Response(
      JSON.stringify({
        allowed: true,
        domainUser: allowedUser.domain_user,
        displayName: allowedUser.display_name,
        roles: roles
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in validate-ad-user:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Simulated AD validation - In production, replace with actual AD/LDAP integration
async function validateActiveDirectory(domainUser: string, password: string): Promise<boolean> {
  // For development/testing, accept any password for users in format DOM\username
  // In production, this should:
  // 1. Connect to AD/LDAP server
  // 2. Validate credentials
  // 3. Return true/false based on AD response
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // For demo purposes, accept any password if format is correct
  // TODO: Replace with actual AD validation
  return domainUser.includes("\\") && password.length > 0;
}
