import { prisma } from "@/lib/prisma";
import SignupClient from "./signup-client";

export default async function SignupPage() {
  const properties = await prisma.property.findMany();
  
  return <SignupClient properties={properties} />;
}
