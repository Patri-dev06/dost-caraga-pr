# DOST Caraga - Procurement System
## Research and System Design Document

**Document Type:** Research & System Development Proposal (RSPD)
**System Name:** DOST Caraga - Procurement System
**Module 1:** Purchase Request Creation and Pre-Validation
**Prepared by:** MIS / ICT Unit
**Prepared for:** Finance and Administrative Services
**Date:** May 04, 2026

---

# 1. System Overview

	The **DOST Caraga - Procurement System** is a proposed web-based information system designed to streamline the procurement process within the office. It shall provide a centralized platform for the creation, pre-validation, routing, approval, and monitoring of Purchase Requests.

	Considering the size and complexity of the full procurement process, the **DOST Caraga - Procurement System** shall be developed by module. The first module shall focus on **Purchase Request Creation and Pre-Validation**, which serves as the initial control point before a request proceeds to approval. The system shall be developed using **Laravel** for the backend, **ReactJS** for the frontend, and **PostgreSQL** for the database.

---

# 2. Executive Summary

	The **DOST Caraga - Procurement System** is proposed to improve the internal procurement process of the office by providing a structured digital platform for handling Purchase Requests. The system is intended to reduce manual checking, improve compliance, strengthen budget control, and provide better visibility over the status of procurement transactions.

	Due to the broad scope of procurement operations, the system shall be developed in phases. The first phase shall focus on **Module 1: Purchase Request Creation and Pre-Validation**. This module is considered a critical foundation of the system because it handles the initial checking of requested items before a Purchase Request is created and routed for approval.

	Based on the actual office workflow, Module 1 shall determine whether a request is charged to a regular fund or a non-regular fund. The system shall then perform the applicable validation against the **Project Procurement Management Plan (PPMP)**, **Line-Item Budget (LIB)** or approved budget allocation, **APP-CSE**, and **APP-Non-CSE** before allowing the request to proceed.

	Once the requested item passes the required validation checks, the system shall allow the Purchase Request to be created and routed to the appropriate recommending and approving authorities. Through this module, the **DOST Caraga - Procurement System** shall help prevent unsupported or non‑compliant requests from moving forward, reduce returned documents, and support a more transparent procurement workflow.

	The proposed technology stack of **Laravel**, **ReactJS**, and **PostgreSQL** is suitable for the secure, modular, and maintainable development of the system. This architecture will also allow the system to be expanded into additional procurement modules in the future.

---

# 3. Background and Problem Statement

	Procurement is an essential administrative function that supports the implementation of programs, projects, and office operations. The preparation of a Purchase Request requires the requesting office to ensure that the items being requested are supported by approved procurement and budget references.

	At present, this checking process is commonly performed manually. Users or concerned personnel may need to review separate files, spreadsheets, project documents, budget records, and procurement references to confirm whether an item may be requested. This manual process may cause delays, especially when several offices are preparing requests at the same time or when reference documents are stored in different formats and locations.

	One of the main issues in the current process is that Purchase Requests may be prepared before full validation is completed. If an item is later found to be missing from the required procurement documents or unsupported by the available budget, the request may be returned for correction. This results in repeated work, delayed processing, and difficulty in monitoring procurement requirements.

	Another concern is the limited visibility over the remaining budget. A project or office may have an approved allocation, but previous or pending requests may have already consumed part of the available amount. Without system-assisted checking, it may be difficult to determine the remaining balance in real time.

	The **DOST Caraga - Procurement System** is proposed to address these operational gaps by establishing a structured digital workflow for Purchase Request pre‑validation. The system shall help reduce manual checking, improve compliance, and strengthen internal control over procurement transactions.

---

# 4. Project Objectives and Expected Outcomes

	The general objective of the **DOST Caraga - Procurement System** is to develop a web-based system that will streamline the procurement process within the office by digitizing the creation, pre‑validation, routing, approval, and monitoring of Purchase Requests.

	For Module 1, the specific objective is to develop a Purchase Request creation and pre‑validation module that will check requested items against the applicable procurement and budget references before the request is allowed to proceed. This module shall help ensure that Purchase Requests are supported by approved documents and available budget before they are routed for approval.

	The system also aims to provide a standardized online interface for creating Purchase Requests. Authorized users shall be able to encode PR details, identify the fund source, select the related project when required, add requested items, and view validation results before submission.

	Another objective is to reduce manual verification by allowing the system to automatically cross‑check requested items against encoded procurement reference data. This shall help minimize returned requests caused by missing references, unavailable budget, or incorrect item classification.

	The system further aims to improve approval routing by forwarding valid Purchase Requests to the appropriate recommending and approving authorities. Each action taken on the request shall be recorded to support monitoring and accountability.

	The expected outcome of Module 1 is a functional pre‑validation system that prevents invalid or unsupported Purchase Requests from proceeding. The module shall reduce processing delays, improve data accuracy, support budget control, and provide a reliable foundation for the succeeding modules of the full procurement system.

---

# 5. Scope and Coverage

	The initial scope of the **DOST Caraga - Procurement System** shall cover **Module 1: Purchase Request Creation and Pre‑validation**. The module shall focus on user authentication and role‑based access. Only authorized users shall be allowed to create Purchase Requests, validate records, review requests, approve requests, or manage reference data depending on their assigned role.

---

# 6. Existing and Proposed Workflow

	The existing office workflow begins when a user initiates the preparation of a Purchase Request and inputs the required PR details. The process then checks whether the request is under a regular fund.

	If the request is not under a regular fund, the user is required to identify the related project. The requested item is then checked against the PPMP. If the item is not included in the PPMP, the request cannot proceed and the user is informed that the item is not in the PPMP. If the item is included in the PPMP, the process proceeds to check whether the item is within the approved budget or Line‑Item Budget. If the item is not within budget, the request cannot proceed and the user is informed that the item is not within budget.

	If the requested item passes the required checking process, the user may proceed to create the Purchase Request. The request is then forwarded to the supervisor or recommending authority for digital signing. After recommendation, the request is forwarded to the Regional Director or authorized approving official for digital signing. Once approved, the request becomes an approved Purchase Request.

	The proposed **DOST Caraga - Procurement System** workflow shall digitize this existing process. Instead of manually checking separate references, the system shall perform the checking automatically using encoded PPMP, LIB or budget allocations, APP‑CSE, and APP‑Non‑CSE data. This will allow users to receive immediate validation results and prevent non‑compliant requests from moving forward.

---

# 7. Implementation Plan

	- **Phase 1:** Requirements Gathering & Workflow Validation
	- **Phase 2:** Database Design & Master Data Preparation
	- **Phase 3:** Backend Development (Laravel)
	- **Phase 4:** Frontend Development (React)
	- **Phase 5:** System Testing & QA
	- **Phase 6:** User Acceptance Testing
	- **Phase 7:** Deployment & Monitoring

---

# 8. Risks and Mitigation Measures

	- Data accuracy
	- User resistance
	- Incorrect validation logic
	- Technical risks
	- Security risks
	- Scope expansion

---

# 9. Conclusion and Recommendation

	The development of the **DOST Caraga - Procurement System** is recommended to streamline the internal procurement process. Module 1 shall serve as a critical foundation and will help prevent unsupported or non‑compliant requests from moving forward, reducing delays and improving budget control.

---

# 10. Appendices

## Appendix A: Proposed Workflow Diagram

**Figure A.1. Proposed workflow for the DOST Caraga - Procurement System Module 1: Purchase Request Creation and Pre‑Validation**

## Appendix B: Proposed Database Tables

See **Table B.1. Proposed Database Tables for Module 1** under Section 10.

## Appendix C: Proposed API Endpoints

Appendix C shall contain the initial list of Laravel API endpoints needed by the ReactJS frontend. These may include endpoints for authentication, users, roles, offices, fund sources, projects, procurement items, PPMP records, budget records, APP‑CSE, APP‑Non‑CSE, Purchase Request validation, Purchase Request creation, approval actions, and audit logs.

## Appendix D: Sample User Interface Wireframes

Appendix D shall contain sample interface designs or mockups for the system. These may include login page, dashboard, Purchase Request creation form, item validation result panel, approval inbox, request details page, and administrative management pages.

## Appendix E: Reference Documents

Appendix E shall contain the procurement and budget documents used as basis for system validation.

---

# 16. API Design

### Proposed REST API endpoints

| Group | Method | Path | Description | Req. payload | Response |
|-------|--------|------|-------------|--------------|----------|
| **Auth** | POST | `/api/auth/login` | Exchange username/password → JWT | `{email,password}` | `{token,expires_in}` |
|  | POST | `/api/auth/logout` | Revoke token |  | `{message}` |
|  | POST | `/api/auth/refresh` | Refresh JWT | `{refresh_token}` | `{token,expires_in}` |
| **Users** | GET | `/api/users` | List users (admin only) | query: `page,per_page,search` | `{data:[…],meta}` |
|  | POST | `/api/users` | Create user | `{name,email,password,role_id,office_id}` | `{id,…}` |
|  | GET | `/api/users/{id}` | Show user |  | `{id,…}` |
|  | PUT | `/api/users/{id}` | Update user | `{name,email,role_id,office_id}` | `{id,…}` |
|  | DELETE | `/api/users/{id}` | Soft‑delete user |  | `{message}` |
| **Roles** | GET | `/api/roles` | List roles |  | `{data:[…]}` |
|  | POST | `/api/roles` | Create role | `{name,permissions}` | `{id,…}` |
| **Offices** | CRUD similar to users (office data). |
| **Fund Sources** | CRUD – `/api/fund-sources` |
| **Projects** | CRUD – `/api/projects` |
| **Procurement Items** | CRUD – `/api/procurement-items` |
| **PPMP** | GET | `/api/ppmp/{project_id}` | List PPMP items for project |  | `{data:[…]}` |
|  | POST | `/api/ppmp/{project_id}` | Add PPMP item | `{item_id,quantity,price}` | `{id,…}` |
| **APP‑CSE / APP‑Non‑CSE** | GET `/api/app-cse/{project_id}` | List items |  | `{data:[…]}` |
|  | GET `/api/app-non-cse/{project_id}` | List items |  | `{data:[…]}` |
| **Budget Allocations** | GET `/api/budget/{project_id}` | View remaining budget |  | `{total,used,available}` |
| **Purchase Requests** | POST | `/api/purchase-requests` | Create PR (validates on submit) | `{fund_type,project_id,items:[…]}` | `{id,…}` |
|  | GET | `/api/purchase-requests` | List PRs (filter by status, office) | `status,office_id,search` | `{data:[…],meta}` |
|  | GET | `/api/purchase-requests/{id}` | Show PR & its items |  | `{id,details,items,validation}` |
|  | PUT | `/api/purchase-requests/{id}` | Update PR before final submission | `{fund_type,items}` | `{id,…}` |
|  | POST | `/api/purchase-requests/{id}/validate` | Run pre‑validation (returns detailed results) |  | `{status,errors,warnings}` |
|  | POST | `/api/purchase-requests/{id}/submit` | Submit for approval (status → *pending*) |  | `{message}` |
| **Approvals** | GET | `/api/approvals` | List approvals assigned to current user |  | `{data:[…]}` |
|  | POST | `/api/approvals/{pr_id}/recommend` | Recommend PR |  | `{message}` |
|  | POST | `/api/approvals/{pr_id}/approve` | Approve PR |  | `{message}` |
|  | POST | `/api/approvals/{pr_id}/reject` | Reject PR | `{reason}` | `{message}` |
| **Audit Logs** | GET | `/api/audit-logs` | List logs (admin) | `page,per_page` | `{data:[…]}` |
| **Attachments** | POST | `/api/purchase-requests/{id}/attachments` | Upload file | multipart | `{id,…}` |
|  | GET | `/api/attachments/{id}` | Download |  | file stream |

### API Critique & Improvement Opportunities

- **Endpoint Design** – Flat CRUD patterns expose too many endpoints; no nesting for approval flow. Use nested routes and consider PATCH for partial updates.
- **Versioning** – No `/api/v1/` prefix. Add API versioning to preserve backward‑compatibility.
- **Pagination & Filtering** – Only simple pagination. Add full query filtering, sorting, and consistent meta.
- **Error Handling** – Standardize error responses (`{code,message,details}`) and use proper HTTP status codes.
- **Rate Limiting** – None. Implement per‑user/IP limits.
- **Auth & Authz** – Only token refresh; no role enforcement shown. Use Laravel policy gates, expose `X-User-Role` header.
- **Validation** – No endpoint for validation rules. Provide `/api/validation-rules` or GraphQL schema.
- **Security** – No CSRF, content‑type enforcement, file limits. Enforce `application/json`, validate CSRF tokens, limit uploads.
- **Docs** – No auto docs. Use OpenAPI annotations and generate Swagger docs.
- **Testing** – No test suites mentioned. Write automated API tests for all endpoints.
- **Performance** – Large payloads. Paginate PR items, use eager loading.
- **Extensibility** – Hard‑coded roles. Use dynamic permission system.
