
import type { Metadata } from 'next'
import ImageCropper from "@/components/imageCropper";
import {BackgroundRippleEffect} from "@/components/ui/background-ripple-effect";
import { TextAnimate } from "@/components/ui/text-animate";

export const metadata: Metadata = {
  title: 'Welcome to my toolbox.',
  alternates: { canonical: 'https://toolbox.maxime-daon.fr' },
};


export default function Page() {
  return (
    <> 
    <main>
      <section className="section-lg max-w-screen overflow-hidden relative">
          <BackgroundRippleEffect />
          <div className="relative container-layout z-50 max-w-[85svw] flex flex-col justify-center gap-8 items-center py-10">
            <TextAnimate className="text-center" animation="blurIn" as="h1">
            Image batch processing
            </TextAnimate>
            <TextAnimate className="text-center w-[60%]" animation="blurIn" as="p">
            Crop, resize, and optimize your images in one go. Perfect for photographers, e-commerce, and anyone with a large image collection. No signup, 100% local.
            </TextAnimate>
            <ImageCropper/>
            
          </div>  
      </section>
    </main>
    </>
  );
}
