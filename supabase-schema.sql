-- Supabase SQL Schema for Multi-Business Gaming Cafe SaaS

-- 1. Create Businesses Table
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Users Table (extends Auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Units Table
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'Snooker', 'Pool', 'PS5'
  rate_str TEXT NOT NULL
);

-- 4. Create Items Table (Global Custom Items)
CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create Sessions Table
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' -- 'active' or 'completed'
);

-- 6. Create Session Segments Table
CREATE TABLE public.session_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  people_count INTEGER NOT NULL,
  rate_per_minute NUMERIC NOT NULL,
  is_happy_hour BOOLEAN DEFAULT FALSE
);

-- 7. Create Session Items Table
CREATE TABLE public.session_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1
);

-- 8. Create Payments Table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  total_amount NUMERIC NOT NULL,
  paid_by TEXT NOT NULL, -- 'Cash' or 'UPI'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies (Row Level Security)
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Allow users to read/write their own business data
CREATE POLICY "Users can access their business data" ON public.businesses
  FOR ALL USING (id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can access their business units" ON public.units
  FOR ALL USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can access their business items" ON public.items
  FOR ALL USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Users can access their business sessions" ON public.sessions
  FOR ALL USING (business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid()));

-- For segments and items linked to sessions
CREATE POLICY "Users can access session segments" ON public.session_segments
  FOR ALL USING (session_id IN (SELECT id FROM public.sessions WHERE business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid())));

CREATE POLICY "Users can access session items" ON public.session_items
  FOR ALL USING (session_id IN (SELECT id FROM public.sessions WHERE business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid())));

CREATE POLICY "Users can access payments" ON public.payments
  FOR ALL USING (session_id IN (SELECT id FROM public.sessions WHERE business_id IN (SELECT business_id FROM public.users WHERE id = auth.uid())));
