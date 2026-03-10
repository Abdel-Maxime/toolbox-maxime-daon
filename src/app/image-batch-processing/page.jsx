
import { SimpleHeader } from "@/components/ui/simple-header";

import { Footer7 } from "@/components/ui/footer";


export default function Page() {
  return (
    <> 
    <main>
      <SimpleHeader />
      <section className="section-lg">
          <div className="container-layout max-w-[85svw] flex flex-col justify-center gap-8 items-center py-10">
            <h1 className="">Image batch processing
            </h1>
            <p className="">
            Drop your messy CSV exports — get back one clean, deduplicated file. No signup, 100% local.
            </p>
            
          </div>  
      </section>
      <Footer7 />
    </main>
      
      
    </>
  );
}
