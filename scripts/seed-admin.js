import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://eniwuiolxxswnuxhhtcw.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_Am3pYzRedAh7ErbKdvPIcw_L_CpkVpH";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);

async function seedAdmin() {
  const email = "igotmeforlife04@gmail.com";
  const password = "SupAdmin/1";
  const fullName = "adminjosh";
  const role = "admin";

  console.log("Creating admin account...");

  // 1. Sign up the admin user via Supabase Auth
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
      },
    },
  });

  if (signUpError) {
    // If user already exists, that's ok
    if (signUpError.message.includes("already registered") || signUpError.message.includes("already been registered")) {
      console.log("Admin user already exists in auth. Updating profile...");
    } else {
      console.error("Error creating admin auth user:", signUpError.message);
      return;
    }
  } else {
    console.log("Admin auth user created:", data.user?.id);
  }

  // 2. Try to find the user by email to get their ID
  // We'll sign in to verify the account
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.log("Note: Could not sign in yet. The admin may need to verify their email first.");
    console.log("Sign in error:", signInError.message);
    console.log("");
    console.log("Admin account created successfully!");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("Username:", fullName);
    console.log("Role:", role);
    console.log("");
    console.log("IMPORTANT: Check your email to verify the account before logging in.");
    return;
  }

  const userId = signInData.user.id;
  console.log("Admin user ID:", userId);

  // 3. Upsert the profile with admin role
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      full_name: fullName,
      email: email,
      role: role,
      status: "approved",
    }, { onConflict: "id" });

  if (profileError) {
    console.error("Error upserting admin profile:", profileError.message);
  } else {
    console.log("Admin profile set with role 'admin' and status 'approved'.");
  }

  // Sign out after seeding
  await supabase.auth.signOut();

  console.log("");
  console.log("Admin account ready!");
  console.log("Email:", email);
  console.log("Password:", password);
  console.log("Username:", fullName);
  console.log("Role:", role);
}

seedAdmin().catch(console.error);
