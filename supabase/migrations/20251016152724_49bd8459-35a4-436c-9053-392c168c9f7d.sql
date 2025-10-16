-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('Admin', 'Reader');

-- Create allowed_users table (whitelist)
CREATE TABLE public.allowed_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_user TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_user TEXT NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (domain_user, role),
  FOREIGN KEY (domain_user) REFERENCES public.allowed_users(domain_user) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_domain_user TEXT, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE domain_user = _domain_user
      AND role = _role
  )
$$;

-- RLS Policies for allowed_users
-- Admins can view all users
CREATE POLICY "Admins can view all users"
ON public.allowed_users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.domain_user = auth.jwt() ->> 'domain_user'
      AND user_roles.role = 'Admin'
  )
);

-- Admins can insert users
CREATE POLICY "Admins can insert users"
ON public.allowed_users
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.domain_user = auth.jwt() ->> 'domain_user'
      AND user_roles.role = 'Admin'
  )
);

-- Admins can update users
CREATE POLICY "Admins can update users"
ON public.allowed_users
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.domain_user = auth.jwt() ->> 'domain_user'
      AND user_roles.role = 'Admin'
  )
);

-- Admins can delete users
CREATE POLICY "Admins can delete users"
ON public.allowed_users
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.domain_user = auth.jwt() ->> 'domain_user'
      AND user_roles.role = 'Admin'
  )
);

-- RLS Policies for user_roles
-- Admins can view all roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.domain_user = auth.jwt() ->> 'domain_user'
      AND ur.role = 'Admin'
  )
);

-- Admins can manage roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.domain_user = auth.jwt() ->> 'domain_user'
      AND ur.role = 'Admin'
  )
);

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.domain_user = auth.jwt() ->> 'domain_user'
      AND ur.role = 'Admin'
  )
);

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.domain_user = auth.jwt() ->> 'domain_user'
      AND ur.role = 'Admin'
  )
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_allowed_users_updated_at
BEFORE UPDATE ON public.allowed_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some initial data for testing
INSERT INTO public.allowed_users (domain_user, display_name, active) VALUES
('BANCO\admin.user', 'Admin User', true),
('BANCO\reader.user', 'Reader User', true);

INSERT INTO public.user_roles (domain_user, role) VALUES
('BANCO\admin.user', 'Admin'),
('BANCO\reader.user', 'Reader');