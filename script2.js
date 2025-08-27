(function () {
"use strict";

// ---------------- Supabase Setup ----------------
const supabaseClient = supabase.createClient(
    "https://greipcnztnxtrltavwys.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyZWlwY256dG54dHJsdGF2d3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDAwMzcsImV4cCI6MjA2NzQ3NjAzN30.8BbvgP4Celro5QsM4CeTOgXwI7Jl7PUwVPi3ZNfJX18"
);

// ---------------- Ready Helper ----------------
var on_ready = (function () {
    var callbacks = [], check_interval = null, check_interval_time = 250;
    var callback_check = function () {
        if ((document.readyState === "interactive" || document.readyState === "complete") && callbacks !== null) {
            var cbs = callbacks, cb_count = cbs.length, i;
            callbacks = null;
            for (i = 0; i < cb_count; ++i) cbs[i].call(null);
            window.removeEventListener("load", callback_check, false);
            window.removeEventListener("readystatechange", callback_check, false);
            if (check_interval !== null) { clearInterval(check_interval); check_interval = null; }
            return true;
        }
        return false;
    };
    window.addEventListener("load", callback_check, false);
    window.addEventListener("readystatechange", callback_check, false);
    return function (cb) {
        if (callbacks === null) cb.call(null);
        else { callbacks.push(cb); if (check_interval === null && callback_check() !== true) check_interval = setInterval(callback_check, check_interval_time); }
    };
})();

// ---------------- Coordinate Class ----------------
var Coordinate = function(parent,id,keyNumber) {
    this.parent = parent;
    this.id = id;
    this.keyNumber = keyNumber;
    this.x = null;
    this.y = null;

    var svgns = this.parent.preview_image_overlay.getAttribute("svgns");
    this.point_node = document.createElementNS(svgns,"rect");
    this.point_node.setAttribute("width","1"); this.point_node.setAttribute("height","1");
    this.point_mask_node = document.createElementNS(svgns,"rect");
    this.point_mask_node.setAttribute("width","1"); this.point_mask_node.setAttribute("height","1");

    this.parent.preview_image_overlay_points.appendChild(this.point_node);
    this.parent.preview_image_overlay_point_masks.appendChild(this.point_mask_node);

    this.display_node = document.createElement("div");
    this.display_node.className = "coordinate_list_entry";
    this.id_node = document.createElement("span");
    this.id_node.className="coordinate_list_entry_id";
    this.id_node.textContent=keyNumber;
    this.coordinate_node = document.createElement("span");
    this.coordinate_node.className="coordinate_list_entry_pos";
    this.display_node.appendChild(this.id_node);
    this.display_node.appendChild(document.createTextNode(": "));
    this.display_node.appendChild(this.coordinate_node);
    this.parent.coordinate_list.appendChild(this.display_node);

    this.enableDrag();
};

Coordinate.prototype.set_position = function(x,y){
    this.x=x; this.y=y;
    this.point_node.setAttribute("x",x); this.point_node.setAttribute("y",y);
    this.point_mask_node.setAttribute("x",x); this.point_mask_node.setAttribute("y",y);
    this.coordinate_node.textContent="("+x+","+y+")";
};

Coordinate.prototype.enableDrag = function() {
    let isDragging = false;
    const onMouseMove = (event) => {
        if (!isDragging) return;
        const rect = this.parent.preview_image_size.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.set_position(x, y);
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.parent.saveCoordinates(), 500);
    };
    const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
    };
    this.point_mask_node.addEventListener("mousedown", (event) => {
        if (event.which !== 1) return;
        isDragging = true;
        this.parent.coordinate_current = this;
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        event.preventDefault();
        event.stopPropagation();
    });
};

// ---------------- Edit Class ----------------
var Edit = (function(){
    var Edit=function(userId){
        this.userId=userId;

        const container = document.getElementById("index2");
        this.edit_region = container.querySelector(".edit_region");

        this.image={node:null,diagramId:null,width:0,height:0};
        this.coordinates=[]; this.coordinate_current=null;

        this.preview_image_size=this.edit_region.querySelector(".preview_image_size");
        this.preview_image_overlay=this.edit_region.querySelector(".preview_image_overlay");
        this.preview_image_overlay_lines=this.edit_region.querySelector(".preview_image_overlay_lines");
        this.preview_image_overlay_lines_bg=this.edit_region.querySelector(".preview_image_overlay_lines_bg");
        this.preview_image_overlay_points=this.edit_region.querySelector(".preview_image_overlay_points");
        this.preview_image_overlay_point_masks=this.edit_region.querySelector(".preview_image_overlay_point_masks");
        this.coordinate_list=this.edit_region.querySelector(".coordinate_list");
    };

    Edit.prototype.loadDiagram=async function(diagramId){
        if(this.image.diagramId!=null) await this.saveCoordinates();
        this.image.diagramId=diagramId;
        const {data:diagram,error}=await supabaseClient.from('diagram_key_coordinates').select('*').eq('diagram_id',diagramId).single();
        if(error){ console.error(error); return; }
        this.set_url(diagram.dam_link);
        this.coordinates.forEach(c=>c.display_node.remove()); this.coordinates=[];
        if(diagram.coordinates){
            diagram.coordinates.forEach((coord,index)=>{
                const c=new Coordinate(this,index,coord.keyNumber);
                this.coordinates.push(c);
                if(coord.left && coord.top){
                    const x = parseInt(coord.left);
                    const y = parseInt(coord.top);
                    c.set_position(x,y);
                }
            });
        }
        await supabaseClient.from('diagram_key_coordinates').upsert({diagram_id:diagramId,last_opened_at:new Date().toISOString()},{onConflict:['diagram_id']});
    };

    Edit.prototype.saveCoordinates=async function(){
        if(!this.coordinates.length||!this.image.diagramId) return;
        const coords=this.coordinates.map(c=>({keyNumber:c.keyNumber,left:c.x!==null?c.x+"px":null,top:c.y!==null?c.y+"px":null}));
        await supabaseClient.from('diagram_key_coordinates').upsert({diagram_id:this.image.diagramId,coordinates:coords},{onConflict:['diagram_id']});
    };

    Edit.prototype.set_url=function(url){
        if(this.image.node){ this.preview_image_size.removeChild(this.image.node); }
        this.image.node=document.createElement("img"); this.image.node.className="preview_image"; this.image.node.setAttribute("alt","");
        this.image.node.onload=()=>{ this.image.width=this.image.node.naturalWidth; this.image.height=this.image.node.naturalHeight; this.preview_image_size.classList.add("preview_image_size_visible"); };
        this.preview_image_size.insertBefore(this.image.node,this.preview_image_overlay);
        this.image.node.src=url;
    };

    Edit.prototype.importDiagrams=async function(importedData){
        const skipped=[];
        for(const diagram of importedData){
            const {data:existing}=await supabaseClient.from('diagram_key_coordinates').select('diagram_id').eq('diagram_id',diagram.diagram_id).single();
            if(existing){ skipped.push(diagram.diagram_id); continue; }
            await supabaseClient.from('diagram_key_coordinates').insert({
                diagram_id:diagram.diagram_id,
                dam_link:diagram.dam_link,
                coordinates:diagram.coordinates || null,
                user_id:this.userId,
                last_opened_at:new Date().toISOString()
            });
        }
        if(skipped.length) alert(`Skipped duplicate diagram IDs: ${skipped.join(", ")}`); 
        else alert("Import complete.");
    };

    Edit.prototype.exportDiagrams=async function(){
        const {data:diagrams}=await supabaseClient.from('diagram_key_coordinates').select('*').eq('user_id',this.userId);
        const csvRows=[];
        const headers=["diagram_id","dam_link","coordinates"];
        csvRows.push(headers.join(","));
        diagrams.forEach(d=>{
            const row=[d.diagram_id,d.dam_link,JSON.stringify(d.coordinates)];
            csvRows.push(row.map(r=>`"${r}"`).join(","));
        });
        const csvString=csvRows.join("\n");
        const blob=new Blob([csvString],{type:"text/csv"});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url; a.download="diagrams_export.csv";
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
    };

    Edit.prototype.deleteAllUserDiagrams=async function(){
        if(!confirm("Are you sure you want to delete all your diagrams? This cannot be undone.")) return;
        await supabaseClient.from('diagram_key_coordinates').delete().eq('user_id',this.userId);
        alert("All your diagrams have been deleted.");
        location.reload();
    };

    return Edit;
})();

// ---------------- Init Auth & UI ----------------
on_ready(async function(){
    const container = document.getElementById("index2");

    const authContainer=document.createElement("div"); authContainer.className="auth_container";
    const emailInput=document.createElement("input"); emailInput.type="email"; emailInput.placeholder="Email";
    const passwordInput=document.createElement("input"); passwordInput.type="password"; passwordInput.placeholder="Password";
    const signInBtn=document.createElement("button"); signInBtn.textContent="Sign In";
    const signOutBtn=document.createElement("button"); signOutBtn.textContent="Sign Out"; signOutBtn.style.display="none";
    const deleteBtn=document.createElement("button"); deleteBtn.textContent="Delete All My Diagrams"; deleteBtn.style.display="none";
    authContainer.append(emailInput,passwordInput,signInBtn,signOutBtn,deleteBtn);
    container.insertBefore(authContainer, container.firstChild);

    let currentUser=null;
    let editInstance=null;

    const nav=document.createElement("div"); nav.className="diagram_navigation";
    const prevBtn=document.createElement("button"); prevBtn.textContent="Previous";
    const nextBtn=document.createElement("button"); nextBtn.textContent="Next";
    const searchInput=document.createElement("input"); searchInput.placeholder="Search by Diagram ID";
    const importBtn=document.createElement("button"); importBtn.textContent="Import JSON";
    const exportBtn=document.createElement("button"); exportBtn.textContent="Export CSV";
    nav.append(prevBtn,searchInput,nextBtn,importBtn,exportBtn);
    container.insertBefore(nav, container.firstChild);

    // ---------- Auth with Logging ----------
    signInBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!email || !password) {
            alert("Enter email and password");
            return;
        }

        try {
            console.log("Attempting login with:", { email, password: password ? "***" : "" });

            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

            if (error) {
                console.error("Supabase login error:", error);
                alert("Login failed: " + error.message);
                return;
            }

            console.log("Supabase login success:", data);
            currentUser = data.user;
            alert("Signed in as " + email);
            signInBtn.style.display = "none";
            signOutBtn.style.display = "inline-block";
            deleteBtn.style.display = "inline-block";

            editInstance = new Edit(currentUser.id);
            await loadUserDiagrams();

        } catch (e) {
            console.error("Unexpected error during login:", e);
            alert("Unexpected login error: " + e.message);
        }
    });

    signOutBtn.addEventListener("click", async ()=> {
        await supabaseClient.auth.signOut();
        currentUser=null; editInstance=null;
        signInBtn.style.display="inline-block"; signOutBtn.style.display="none"; deleteBtn.style.display="none";
        alert("Signed out");
    });

    deleteBtn.addEventListener("click", async ()=> {
        if(editInstance) await editInstance.deleteAllUserDiagrams();
    });

    // ---------- Load Diagrams ----------
    let currentIndex=0;
    let diagramIds=[];

    async function loadUserDiagrams(){
        if(!currentUser || !editInstance) return;
        const {data:diagrams}=await supabaseClient.from('diagram_key_coordinates').select('diagram_id').eq('user_id',currentUser.id).order('last_opened_at',{ascending:true});
        diagramIds=diagrams.map(d=>d.diagram_id);
        currentIndex=0;
        if(diagramIds.length) await editInstance.loadDiagram(diagramIds[currentIndex]);
    }

    prevBtn.addEventListener("click", async ()=> {
        if(!diagramIds.length) return;
        currentIndex=Math.max(0,currentIndex-1);
        await editInstance.loadDiagram(diagramIds[currentIndex]);
    });

    nextBtn.addEventListener("click", async ()=> {
        if(!diagramIds.length) return;
        currentIndex=Math.min(diagramIds.length-1,currentIndex+1);
        await editInstance.loadDiagram(diagramIds[currentIndex]);
    });

    searchInput.addEventListener("keypress", async (e)=> {
        if(e.key==="Enter" && searchInput.value.trim()){
            const targetId = searchInput.value.trim();
            if(diagramIds.includes(targetId)){
                currentIndex = diagramIds.indexOf(targetId);
                await editInstance.loadDiagram(targetId);
            } else {
                alert("Diagram ID not found for this user.");
            }
        }
    });

    importBtn.addEventListener("click", async ()=> {
        const json = prompt("Paste JSON data for import:");
        if(json){
            try{
                const importedData = JSON.parse(json);
                await editInstance.importDiagrams(importedData);
                await loadUserDiagrams();
            }catch(e){
                alert("Invalid JSON");
            }
        }
    });

    exportBtn.addEventListener("click", async ()=> {
        if(editInstance) await editInstance.exportDiagrams();
    });
});
})();
