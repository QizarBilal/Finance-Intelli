import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";

export function SetupWizard() {
  const [, setLocation] = useLocation();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState(1);
  
  const [formData, setFormData] = useState({
    full_name: "",
    occupation: "",
    company: "",
    income_type: "Salary",
    currency: "INR",
    country: "",
    state: "",
    monthly_income: "",
    salary_frequency: "monthly",
    monthly_goal: "",
    weekly_savings_goal: "",
    emergency_fund_goal: "",
    theme: "dark",
    week_start_day: "Monday"
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleNext = () => setStep(s => Math.min(s + 1, 4));
  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const handleComplete = () => {
    updateProfile.mutate({
      data: {
        ...formData,
        monthly_income: Number(formData.monthly_income),
        monthly_goal: Number(formData.monthly_goal),
        weekly_savings_goal: Number(formData.weekly_savings_goal),
        emergency_fund_goal: Number(formData.emergency_fund_goal)
      }
    }, {
      onSuccess: () => {
        localStorage.setItem("profile_setup_complete", "true");
        setLocation("/");
      }
    });
  };

  const steps = [
    {
      title: "Personal Details",
      description: "Let's get to know you.",
      fields: ["full_name", "occupation", "company"]
    },
    {
      title: "Financial Profile",
      description: "How money comes in.",
      fields: ["currency", "monthly_income", "salary_frequency", "income_type"]
    },
    {
      title: "Your Goals",
      description: "What are we aiming for?",
      fields: ["monthly_goal", "weekly_savings_goal", "emergency_fund_goal"]
    },
    {
      title: "Preferences",
      description: "Make it yours.",
      fields: ["theme", "week_start_day", "country", "state"]
    }
  ];

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full" />
        <Card className="relative z-10 p-8 glass-panel border-white/10">
          <div className="flex gap-2 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div 
                key={i} 
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-primary" : "bg-white/10"
                }`}
              />
            ))}
          </div>

          <h2 className="text-2xl font-bold mb-2">{steps[step-1].title}</h2>
          <p className="text-muted-foreground mb-6">{steps[step-1].description}</p>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {steps[step-1].fields.map(field => (
                <div key={field} className="space-y-2">
                  <Label className="capitalize text-white/80">
                    {field.replace(/_/g, ' ')}
                  </Label>
                  <Input 
                    name={field}
                    value={formData[field as keyof typeof formData]}
                    onChange={handleChange}
                    className="bg-white/5 border-white/10 focus-visible:ring-primary"
                  />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>

          <div className="flex justify-between mt-8">
            <Button 
              variant="ghost" 
              onClick={handleBack} 
              disabled={step === 1}
              className="text-white/70"
            >
              Back
            </Button>
            {step < 4 ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleComplete} disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving..." : "Complete Setup"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}