import type { Metadata } from 'next'
import { BackgroundRippleEffect } from "@/components/ui/background-ripple-effect";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { TextAnimate } from "@/components/ui/text-animate";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button";


export const metadata: Metadata = {
  title: 'Welcome to my toolbox.',
  alternates: { canonical: 'https://toolbox.maxime-daon.fr' },
}

export default function Home() {
  return (
    <> 
    <main>
      <section className="section-lg max-w-screen overflow-hidden relative">
          <BackgroundRippleEffect />
          <div className="relative container-layout z-10 max-w-[85svw] flex flex-col justify-center gap-8 items-center py-10">
            <div className="flex justify-center items-center gap-4">
            <TextAnimate animation="blurIn" as="h1">
              Discover my personnal Toolbox
            </TextAnimate>
            </div>
            <TextAnimate className="text-center w-[60%]" animation="blurIn" as="p">
            Find here all my tools, made for you, to make your life easier. From CSV merging and cleaning, to image batch processing, and more to come soon... No signup, 100% free and local.
            </TextAnimate>
            <div>
              <ShimmerButton>
                Explore the tools
              </ShimmerButton>
            </div>
            <div className="flex flex-rox w-full gap-8 justify-center">
              <Card className="w-60">
                <CardHeader>
                  <CardTitle>CSV merge & clean tool</CardTitle>
                  <CardDescription>Clean and merge your CSV files, kill duplicated rows with precision and fix encoding errors.</CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button>Tester</Button>
                </CardFooter>
              </Card>
              <Card className="w-60">
                <CardHeader>
                  <CardTitle>CSV merge & clean tool</CardTitle>
                  <CardDescription>Clean and merge your CSV files, kill duplicated rows with precision and fix encoding errors.</CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button>Tester</Button>
                </CardFooter>
              </Card>
            </div>
          </div>  
      </section>
    </main>
      
      
    </>
  );
}
