import React, { useState } from "react";
import { Layout } from "@/components/layout";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function Settings() {
  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    full_name: "",
    occupation: "",
    company: "",
    currency: "INR",
    monthly_income: "",
    monthly_goal: "",
  });

  // Sync form data when profile loads
  React.useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        occupation: profile.occupation || "",
        company: profile.company || "",
        currency: profile.currency || "INR",
        monthly_income: profile.monthly_income?.toString() || "",
        monthly_goal: profile.monthly_goal?.toString() || "",
      });
    }
  }, [profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = () => {
    if (!profile) return;
    
    updateProfile.mutate({
      data: {
        ...profile,
        ...formData,
        monthly_income: Number(formData.monthly_income) || undefined,
        monthly_goal: Number(formData.monthly_goal) || undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Settings Saved", description: "Your profile has been updated successfully." });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Could not save settings." });
      }
    });
  };

  if (isLoading) {
    return <Layout><div className="p-10 animate-pulse text-muted-foreground">Loading settings...</div></Layout>;
  }

  return (
    <Layout>
      <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your profile and preferences</p>
        </div>

        <div className="space-y-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input name="full_name" value={formData.full_name} onChange={handleChange} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label>Occupation</Label>
                  <Input name="occupation" value={formData.occupation} onChange={handleChange} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input name="company" value={formData.company} onChange={handleChange} className="bg-white/5 border-white/10" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Financial Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Base Currency</Label>
                  <Input name="currency" value={formData.currency} onChange={handleChange} className="bg-white/5 border-white/10 uppercase" maxLength={3} />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Income</Label>
                  <Input type="number" name="monthly_income" value={formData.monthly_income} onChange={handleChange} className="bg-white/5 border-white/10" />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Savings Target</Label>
                  <Input type="number" name="monthly_goal" value={formData.monthly_goal} onChange={handleChange} className="bg-white/5 border-white/10" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}