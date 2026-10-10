ALBUKHR EXTERNAL PROJECT SOP — KUNSHIN SHIGARWA / INSTALL PACKAGE v1.0

ABUBUWAN DA KE CIKI
- admin-external-sop.html: shafin HTML bilingual, responsive, mai search da Print / Save as PDF; yana duba Mainnet Admin, MFA/AAL2 da role kafin nuna body.
- ALBUKHR_External_Project_Admin_SOP_Approved_v1.0_EN_HA.docx: kwafin Word mai damar gyara.
- ALBUKHR_External_Project_Admin_SOP_Approved_v1.0_EN_HA.txt: kwafin rubutu mai sauƙin search.
- ALBUKHR_External_Project_SOP_Admin_Integration.patch: ƙaramin patch da zai sa button a admin-external-projects.html kawai, kuma ya nuna shi bayan auth/MFA da role check ga super_admin ko external_admin.

HANYAR SHIGARWA (A CIKIN REPOSITORY CHECKOUT)
1. Yi backup kuma ka ƙirƙiri feature branch.
2. Kwafi admin-external-sop.html zuwa root na albukhr-admin (wurin da admin-external-projects.html yake).
3. Daga root na repository, gudanar da:
   git apply --check ALBUKHR_External_Project_SOP_Admin_Integration.patch
   git apply ALBUKHR_External_Project_SOP_Admin_Integration.patch
4. Tabbatar button ya kasance a admin-external-projects.html kawai, ba cikin admin-module.html ba.
5. Duba diff, sannan gwada login, MFA/AAL2, super_admin, external_admin, sauran roles, direct URL ba tare da session ba, wayar hannu, search da Print / Save as PDF.
6. Kada a deploy sai an gama review da gwaji ta tsarin release na ALBUKHR.

MUHIMMIN BAYANIN TSARO — KAR A TSALLAKE
HTML ɗin yana duba Mainnet Admin authentication, MFA/AAL2 idan settings sun wajabta, da role super_admin/external_admin kafin ya nuna takardar. Amma cikakken rubutun SOP yana cikin source na static HTML. Idan repository ko hosted HTML yana buɗe ga jama'a, wannan client-side check ba ya ɓoye bayanan daga wanda zai duba source. Saboda haka, kada a saka wannan HTML mai cikakken SOP a public repository ko a deploy shi a matsayin takardar sirri. Don tabbatar da sirri na gaske, a fara ɗora SOP a private Supabase Storage ko server endpoint mai server-side role/AAL2 enforcement, sannan shafin ya nemi takardar ne kawai bayan an ba da izini. Wannan kunshin bai ƙirƙiri bucket, SQL policy, server endpoint ko production permission ba.

IYAKAR CANJIN
- Ba a sauya admin-module.html, Dock Navigation, auth core, Supabase core, environment core, page auth guard, database, policies ko production deployment ba.
- Button ɗin an tsara shi ne ya kasance a External Projects kawai kuma ya bayyana ga global roles ɗin da Admin Control Center ya ware: super_admin ko external_admin.
- Amincewar ALBUKHR Team ta shafi matsayin SOP kawai; ba ta ba da sabon software/database permission ba.
- GitHub branch creation ya dawo HTTP 403 (Resource not accessible by integration); saboda haka ba a ƙirƙiri commit ko Pull Request ba.

BAYANAN AMINCEWA
Matsayi: APPROVED SOP v1.0 — amfani na cikin gida kawai
Iyakar amfani: Admin na External Projects
Funder Sign: BUHARI SAIDU
Ranar amincewa: 10 October 2026
